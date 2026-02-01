import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { AgentLoop, UpdateCallback } from './agent/agentLoop.js';
import { ToolExecutor } from './agent/tools.js';
import { validateWorkspace, getWorkspaceInfo, getWorkspaceTree } from './workspace/workspace.js';
import { backendConfig } from './config.js';
import { logger } from './logger.js';
import { SocketRateLimiter } from './utils/socketRateLimiter.js';
import {
  ValidationError,
  diffActionSchema,
  diffParamsSchema,
  commandConfirmationSchema,
  formatValidationIssues,
  gitOperationSchema,
  parseWithSchema,
  sessionParamsSchema,
  sessionResumeSchema,
  sessionStateRequestSchema,
  taskContinueSchema,
  taskStartSchema,
  workspaceTreeQuerySchema,
  workspaceValidateSchema,
} from './validation.js';
import type { TaskRequest, AgentUpdate, ModelConfig, GitOperationRequest } from './types.js';
import type { CommandConfirmationRequest } from './types.js';

export interface BackendServerOptions {
  apiKey?: string;
  corsOrigins?: string[];
  agentLoopFactory?: (
    apiKey: string,
    workspacePath: string,
    task: string,
    onUpdate: UpdateCallback,
    modelConfig?: ModelConfig,
    systemPrompt?: string
  ) => AgentLoop;
  validateWorkspaceFn?: typeof validateWorkspace;
  getWorkspaceInfoFn?: typeof getWorkspaceInfo;
  getWorkspaceTreeFn?: typeof getWorkspaceTree;
}

export interface BackendServerInstance {
  app: express.Express;
  httpServer: ReturnType<typeof createServer>;
  io: SocketIOServer;
  activeSessions: Map<string, AgentLoop>;
  start: (port?: number) => Promise<{ port: number }>;
  stop: () => Promise<void>;
}

export function createBackendServer(
  options: BackendServerOptions = {}
): BackendServerInstance {
  const apiKey = options.apiKey ?? process.env.MOONSHOT_API_KEY ?? '';
  const corsOrigins = options.corsOrigins ?? backendConfig.server.corsOrigins;
  const makeAgent =
    options.agentLoopFactory ??
    ((key, workspacePath, task, onUpdate, modelConfig, systemPrompt) =>
      new AgentLoop(key, workspacePath, task, onUpdate, modelConfig, systemPrompt));
  const validateWorkspaceFn = options.validateWorkspaceFn ?? validateWorkspace;
  const getWorkspaceInfoFn = options.getWorkspaceInfoFn ?? getWorkspaceInfo;
  const getWorkspaceTreeFn = options.getWorkspaceTreeFn ?? getWorkspaceTree;

  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors());
  app.use(express.json());

  if (backendConfig.server.rateLimit.enabled) {
    app.use(
      '/api',
      rateLimit({
        windowMs: backendConfig.server.rateLimit.windowMs,
        max: backendConfig.server.rateLimit.max,
        standardHeaders: backendConfig.server.rateLimit.standardHeaders,
        legacyHeaders: backendConfig.server.rateLimit.legacyHeaders,
      })
    );
  }

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('http_request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
      });
    });
    next();
  });

  const activeSessions = new Map<string, AgentLoop>();
  const sessionTimeouts = new Map<string, NodeJS.Timeout>();

  // Socket rate limiter: 60 events per minute per connection
  const socketRateLimiter = new SocketRateLimiter({
    maxEvents: backendConfig.server.socketRateLimit?.maxEvents ?? 60,
    windowMs: backendConfig.server.socketRateLimit?.windowMs ?? 60 * 1000,
    bypassEvents: ['disconnect', 'error', 'agent:update'],
  });

  // Cleanup expired rate limit entries every 5 minutes
  const rateLimitCleanupInterval = setInterval(() => {
    socketRateLimiter.cleanup();
  }, 5 * 60 * 1000);
  rateLimitCleanupInterval.unref();

  // Session tracking for cleanup
  const sessionLastActivity = new Map<string, number>();

  /**
   * Periodic cleanup of stale sessions
   * Removes sessions that have been inactive for longer than the grace period
   */
  const sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = backendConfig.server.sessionGraceMs * 2; // 2x grace period for stale

    let cleanedCount = 0;
    for (const [sessId, lastActivity] of sessionLastActivity.entries()) {
      if (now - lastActivity > staleThreshold) {
        const agent = activeSessions.get(sessId);
        if (agent) {
          agent.stop();
        }
        activeSessions.delete(sessId);
        sessionLastActivity.delete(sessId);
        const timeout = sessionTimeouts.get(sessId);
        if (timeout) {
          clearTimeout(timeout);
          sessionTimeouts.delete(sessId);
        }
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('session_cleanup', {
        cleaned: cleanedCount,
        remaining: activeSessions.size,
      });
    }
  }, backendConfig.server.sessionCleanupIntervalMs);
  sessionCleanupInterval.unref();

  /**
   * Check if we can accept a new session
   */
  const canAcceptNewSession = (): boolean => {
    return activeSessions.size < backendConfig.server.maxSessions;
  };

  /**
   * Update session activity timestamp
   */
  const updateSessionActivity = (sessId: string): void => {
    sessionLastActivity.set(sessId, Date.now());
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasApiKey: !!apiKey });
  });

  const sendValidationError = (res: express.Response, error: unknown) => {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationIssues(error.issues),
      });
    }
    throw error;
  };

  const validateRequest = <T>(
    schema: (data: unknown) => T,
    getPayload: (req: express.Request) => unknown
  ) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        res.locals.payload = schema(getPayload(req));
        next();
      } catch (error) {
        return sendValidationError(res, error);
      }
    };

  app.post(
    '/api/workspace/validate',
    validateRequest((value) => parseWithSchema(workspaceValidateSchema, value), (req) => req.body),
    async (req, res) => {
      const payload = res.locals.payload as { path: string };
      const isValid = await validateWorkspaceFn(payload.path);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid workspace path' });
      }

      const info = await getWorkspaceInfoFn(payload.path);
      res.json(info);
    }
  );

  app.get(
    '/api/workspace/tree',
    validateRequest(
      (value) => parseWithSchema(workspaceTreeQuerySchema, value),
      (req) => ({
        path: req.query.path,
        depth: req.query.depth,
        maxEntries: req.query.maxEntries,
      })
    ),
    async (req, res) => {
      const payload = res.locals.payload as { path: string; depth?: number; maxEntries?: number };
      const isValid = await validateWorkspaceFn(payload.path);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid workspace path' });
      }

      const tree = await getWorkspaceTreeFn(payload.path, {
        maxDepth: payload.depth,
        maxEntries: payload.maxEntries,
      });

      res.json(tree);
    }
  );

  app.get(
    '/api/session/:sessionId/diffs',
    validateRequest((value) => parseWithSchema(sessionParamsSchema, value), (req) => req.params),
    (req, res) => {
      const { sessionId } = res.locals.payload as { sessionId: string };
      const agent = activeSessions.get(sessionId);

      if (!agent) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const diffs = agent.getPendingDiffs();
      res.json(diffs);
    }
  );

  app.get(
    '/api/session/:sessionId/diff/:diffId',
    validateRequest((value) => parseWithSchema(diffParamsSchema, value), (req) => req.params),
    (req, res) => {
      const { sessionId, diffId } = res.locals.payload as { sessionId: string; diffId: string };
      const agent = activeSessions.get(sessionId);

      if (!agent) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const diff = agent.getPendingDiff(diffId);
      if (!diff) {
        return res.status(404).json({ error: 'Diff not found' });
      }

      res.json({
        id: diff.id,
        path: diff.path,
        operation: diff.operation,
        oldPath: diff.oldPath,
        newPath: diff.newPath,
        original: diff.original ?? '',
        proposed: diff.proposed ?? '',
        diff: diff.diff,
      });
    }
  );

  io.on('connection', (socket) => {
    logger.info('socket_connected', { socketId: socket.id });

    let currentAgent: AgentLoop | null = null;
    let sessionId: string | null = null;

    const onUpdate: UpdateCallback = (update: AgentUpdate) => {
      socket.emit('agent:update', update);
    };

    const emitValidationError = (event: string, message: string) => {
      socket.emit('agent:update', {
        type: 'error',
        data: { message: `Invalid ${event} payload: ${message}` },
      });
    };

    /**
     * Check rate limit before processing an event
     * Returns true if allowed, false if rate limited
     */
    const checkRateLimit = (eventName: string): boolean => {
      const result = socketRateLimiter.check(socket.id, eventName);
      if (!result.allowed) {
        logger.warn('socket_rate_limited', {
          socketId: socket.id,
          event: eventName,
          retryAfter: result.retryAfter,
        });
        socket.emit('agent:update', {
          type: 'error',
          data: {
            message: `Rate limit exceeded. Please wait ${result.retryAfter} seconds before retrying.`,
            code: 'RATE_LIMITED',
            retryAfter: result.retryAfter,
          },
        });
        return false;
      }
      return true;
    };

    const parseSocketPayload = <T>(
      event: string,
      schema: (data: unknown) => T,
      data: unknown,
      onError?: (message: string) => void
    ): T | null => {
      try {
        const candidate = data ?? {};
        return schema(candidate);
      } catch (error) {
        if (error instanceof ValidationError) {
          const details = formatValidationIssues(error.issues);
          logger.warn('socket_validation_failed', { event, details, socketId: socket.id });
          if (onError) {
            onError(details);
          } else {
            emitValidationError(event, details);
          }
          return null;
        }
        throw error;
      }
    };

    socket.on('session:resume', (data: { sessionId?: string }) => {
      const payload = parseSocketPayload(
        'session:resume',
        (value) => parseWithSchema(sessionResumeSchema, value),
        data,
        (details) => {
          socket.emit('session:expired', { message: `Invalid session:resume payload: ${details}` });
        }
      );
      if (!payload) return;

      const requestedId = payload.sessionId;
      if (!requestedId) {
        socket.emit('session:expired', {
          message: 'No session to resume. Please start a new task.',
        });
        return;
      }

      const existingAgent = activeSessions.get(requestedId);
      if (!existingAgent) {
        socket.emit('session:expired', {
          sessionId: requestedId,
          message: 'Session expired. Please start a new task.',
        });
        return;
      }

      currentAgent = existingAgent;
      sessionId = requestedId;
      currentAgent.setUpdateCallback(onUpdate);
      updateSessionActivity(requestedId);

      const timeout = sessionTimeouts.get(requestedId);
      if (timeout) {
        clearTimeout(timeout);
        sessionTimeouts.delete(requestedId);
      }

      socket.emit('session:resumed', { sessionId: requestedId });
      socket.emit('session:diffs', { diffs: currentAgent.getPendingDiffs() });
      socket.emit('session:state', { state: currentAgent.getSerializableState() });

      socket.emit('agent:update', {
        type: 'info',
        data: {
          message: currentAgent.getState().isRunning
            ? 'Session resumed. Agent is still running.'
            : 'Session resumed.',
        },
      });
    });

    socket.on('session:state:request', (data: { sessionId?: string }) => {
      const payload = parseSocketPayload(
        'session:state:request',
        (value) => parseWithSchema(sessionStateRequestSchema, value),
        data
      );
      if (!payload) return;

      const requestedId = payload.sessionId ?? sessionId;
      if (!requestedId) {
        socket.emit('session:expired', {
          message: 'No session to resume. Please start a new task.',
        });
        return;
      }

      const existingAgent = activeSessions.get(requestedId);
      if (!existingAgent) {
        socket.emit('session:expired', {
          sessionId: requestedId,
          message: 'Session expired. Please start a new task.',
        });
        return;
      }

      socket.emit('session:state', { state: existingAgent.getSerializableState() });
    });

    socket.on('task:start', async (data: TaskRequest) => {
      if (!checkRateLimit('task:start')) return;

      if (!apiKey) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'MOONSHOT_API_KEY environment variable not set' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'task:start',
        (value) => parseWithSchema(taskStartSchema, value),
        data
      );
      if (!payload) return;

      const { task, workspacePath, modelConfig, systemPrompt } = payload;

      const isValid = await validateWorkspaceFn(workspacePath);
      if (!isValid) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Invalid workspace path' },
        });
        return;
      }

      // Check session limit (allow if current socket already has a session)
      if (!sessionId && !canAcceptNewSession()) {
        logger.warn('session_limit_reached', {
          currentSessions: activeSessions.size,
          maxSessions: backendConfig.server.maxSessions,
        });
        socket.emit('agent:update', {
          type: 'error',
          data: {
            message: `Server is at maximum capacity (${backendConfig.server.maxSessions} sessions). Please try again later.`,
            code: 'SESSION_LIMIT_REACHED',
          },
        });
        return;
      }

      if (currentAgent) {
        currentAgent.stop();
      }

      const resolvedModelConfig = {
        model: modelConfig?.model ?? backendConfig.model.defaultModel,
        temperature: modelConfig?.temperature ?? backendConfig.model.defaultTemperature,
        maxTokens: modelConfig?.maxTokens ?? backendConfig.model.defaultMaxTokens,
        baseUrl: modelConfig?.baseUrl ?? backendConfig.model.defaultBaseUrl,
      };

      currentAgent = makeAgent(
        apiKey,
        workspacePath,
        task,
        onUpdate,
        resolvedModelConfig,
        systemPrompt
      );
      sessionId = currentAgent.getState().taskId;
      activeSessions.set(sessionId, currentAgent);
      updateSessionActivity(sessionId);

      const timeout = sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        sessionTimeouts.delete(sessionId);
      }

      socket.emit('session:started', { sessionId });
      socket.emit('session:state', { state: currentAgent.getSerializableState() });

      try {
        await currentAgent.start();
      } catch (error) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: (error as Error).message },
        });
      }
    });

    socket.on('task:stop', () => {
      if (currentAgent) {
        currentAgent.stop();
        socket.emit('agent:update', {
          type: 'message',
          data: { content: 'Task stopped by user' },
        });
      }
    });

    socket.on('task:continue', async (data: { message: string }) => {
      if (!checkRateLimit('task:continue')) return;

      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'task:continue',
        (value) => parseWithSchema(taskContinueSchema, value),
        data
      );
      if (!payload) return;

      if (sessionId) updateSessionActivity(sessionId);
      currentAgent.addUserMessage(payload.message);
      try {
        await currentAgent.start();
      } catch (error) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: (error as Error).message },
        });
      }
    });

    socket.on('diff:apply', async (data: { diffId: string }) => {
      if (!checkRateLimit('diff:apply')) return;

      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'diff:apply',
        (value) => parseWithSchema(diffActionSchema, value),
        data
      );
      if (!payload) return;

      try {
        const applied = await currentAgent.applyDiff(payload.diffId);
        if (applied) {
          socket.emit('diff:applied', {
            diffId: payload.diffId,
            path: applied.path,
          });
        } else {
          socket.emit('agent:update', {
            type: 'error',
            data: { message: 'Diff not found' },
          });
        }
      } catch (error) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: (error as Error).message },
        });
      }
    });

    socket.on('diff:reject', (data: { diffId: string }) => {
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'diff:reject',
        (value) => parseWithSchema(diffActionSchema, value),
        data
      );
      if (!payload) return;

      const rejected = currentAgent.rejectDiff(payload.diffId);
      if (rejected) {
        socket.emit('diff:rejected', { diffId: payload.diffId, path: rejected.path });
      } else {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Diff not found' },
        });
      }
    });

    socket.on('diff:apply_all', async () => {
      if (!checkRateLimit('diff:apply_all')) return;

      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      try {
        const applied = await currentAgent.applyAllDiffs();
        applied.forEach((diff) => {
          socket.emit('diff:applied', {
            diffId: diff.id,
            path: diff.path,
          });
        });
        if (applied.length === 0) {
          socket.emit('agent:update', {
            type: 'info',
            data: { message: 'No pending diffs to apply.' },
          });
        }
      } catch (error) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: (error as Error).message },
        });
      }
    });

    socket.on('diff:reject_all', () => {
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const rejected = currentAgent.rejectAllDiffs();
      rejected.forEach((diff) => {
        socket.emit('diff:rejected', { diffId: diff.id, path: diff.path });
      });
      if (rejected.length === 0) {
        socket.emit('agent:update', {
          type: 'info',
          data: { message: 'No pending diffs to reject.' },
        });
      }
    });

    socket.on('command:confirm', (data: CommandConfirmationRequest) => {
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'command:confirm',
        (value) => parseWithSchema(commandConfirmationSchema, value),
        data
      );
      if (!payload) return;

      const confirmed = currentAgent.confirmCommand(payload.commandId);
      if (!confirmed) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Command confirmation not found' },
        });
      }
    });

    socket.on('command:reject', (data: CommandConfirmationRequest) => {
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      const payload = parseSocketPayload(
        'command:reject',
        (value) => parseWithSchema(commandConfirmationSchema, value),
        data
      );
      if (!payload) return;

      const rejected = currentAgent.rejectCommand(payload.commandId);
      if (!rejected) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Command confirmation not found' },
        });
      }
    });

    const runGitOperation = async (
      action: 'pull' | 'push',
      data: GitOperationRequest
    ) => {
      const payload = parseSocketPayload(
        `git:${action}`,
        (value) => parseWithSchema(gitOperationSchema, value),
        data,
        (details) => {
          socket.emit('git:error', {
            action,
            message: `Invalid git:${action} payload: ${details}`,
          });
        }
      );
      if (!payload) return;
      const workspacePath = payload.workspacePath;

      const isValid = await validateWorkspaceFn(workspacePath);
      if (!isValid) {
        socket.emit('git:error', {
          action,
          message: 'Invalid workspace path',
        });
        return;
      }

      const info = await getWorkspaceInfoFn(workspacePath);
      if (!info.isGitRepo) {
        socket.emit('git:error', {
          action,
          message: 'Workspace is not a git repository',
        });
        return;
      }

      socket.emit('git:started', { action });

      try {
        const executor = new ToolExecutor(workspacePath);
        const result = await executor.gitOperations({
          action,
          args: {
            remote: payload.remote,
            branch: payload.branch,
          },
        });

        socket.emit('git:result', {
          action,
          result,
        });
      } catch (error) {
        socket.emit('git:error', {
          action,
          message: (error as Error).message,
        });
      }
    };

    socket.on('git:pull', (data: GitOperationRequest) => {
      void runGitOperation('pull', data);
    });

    socket.on('git:push', (data: GitOperationRequest) => {
      void runGitOperation('push', data);
    });

    socket.on('file:pin', async (data: { path: string }) => {
      try {
        if (!currentAgent) {
          socket.emit('error', { message: 'No active agent session' });
          return;
        }

        await currentAgent.pinFile(data.path);
        socket.emit('file:pinned', { path: data.path });
      } catch (error) {
        logger.error('file_pin_failed', { error, path: data.path });
        socket.emit('error', { message: `Failed to pin file: ${(error as Error).message}` });
      }
    });

    socket.on('file:unpin', (data: { path: string }) => {
      try {
        if (!currentAgent) {
          socket.emit('error', { message: 'No active agent session' });
          return;
        }

        currentAgent.unpinFile(data.path);
        socket.emit('file:unpinned', { path: data.path });
      } catch (error) {
        logger.error('file_unpin_failed', { error, path: data.path });
        socket.emit('error', { message: `Failed to unpin file: ${(error as Error).message}` });
      }
    });

    socket.on('disconnect', () => {
      logger.info('socket_disconnected', { socketId: socket.id });

      // Clean up rate limiter entry for this socket
      socketRateLimiter.remove(socket.id);

      if (sessionId && currentAgent) {
        const capturedSessionId = sessionId;
        const timeout = setTimeout(() => {
          currentAgent?.stop();
          activeSessions.delete(capturedSessionId);
          sessionTimeouts.delete(capturedSessionId);
        }, backendConfig.server.sessionGraceMs);
        timeout.unref();
        sessionTimeouts.set(capturedSessionId, timeout);
      }
    });
  });

  const start = (port: number = backendConfig.server.defaultPort) =>
    new Promise<{ port: number }>((resolve) => {
      httpServer.listen(port, () => {
        const address = httpServer.address();
        const actualPort =
          typeof address === 'object' && address ? address.port : port;
        logger.info('server_started', { port: actualPort });
        if (!apiKey) {
          logger.warn('missing_api_key', {
            message: 'MOONSHOT_API_KEY environment variable not set',
          });
        }
        resolve({ port: actualPort });
      });
    });

  const stop = () =>
    new Promise<void>((resolve, reject) => {
      // Clear cleanup intervals
      clearInterval(rateLimitCleanupInterval);
      clearInterval(sessionCleanupInterval);

      for (const timeout of sessionTimeouts.values()) {
        clearTimeout(timeout);
      }
      sessionTimeouts.clear();
      sessionLastActivity.clear();

      if (!httpServer.listening) {
        resolve();
        return;
      }

      try {
        io.close(() => {
          httpServer.close((error) => {
            if (error) {
              if ((error as Error).message === 'Server is not running.') {
                resolve();
                return;
              }
              reject(error);
              return;
            }
            resolve();
          });
        });
      } catch (error) {
        if ((error as Error).message === 'Server is not running.') {
          resolve();
          return;
        }
        reject(error);
      }
    });

  return { app, httpServer, io, activeSessions, start, stop };
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || backendConfig.server.defaultPort;
  const server = createBackendServer();
  void server.start(port);
}
