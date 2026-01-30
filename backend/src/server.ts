import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { AgentLoop, UpdateCallback } from './agent/agentLoop.js';
import { validateWorkspace, getWorkspaceInfo } from './workspace/workspace.js';
import type { TaskRequest, AgentUpdate } from './types.js';

export interface BackendServerOptions {
  apiKey?: string;
  corsOrigins?: string[];
  agentLoopFactory?: (
    apiKey: string,
    workspacePath: string,
    task: string,
    onUpdate: UpdateCallback
  ) => AgentLoop;
  validateWorkspaceFn?: typeof validateWorkspace;
  getWorkspaceInfoFn?: typeof getWorkspaceInfo;
}

export interface BackendServerInstance {
  app: express.Express;
  httpServer: ReturnType<typeof createServer>;
  io: SocketIOServer;
  activeSessions: Map<string, AgentLoop>;
  start: (port?: number) => Promise<{ port: number }>;
  stop: () => Promise<void>;
}

const DEFAULT_PORT = 3001;
const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
const SESSION_GRACE_MS = 2 * 60 * 1000;

export function createBackendServer(
  options: BackendServerOptions = {}
): BackendServerInstance {
  const apiKey = options.apiKey ?? process.env.MOONSHOT_API_KEY ?? '';
  const corsOrigins = options.corsOrigins ?? DEFAULT_CORS_ORIGINS;
  const makeAgent =
    options.agentLoopFactory ??
    ((key, workspacePath, task, onUpdate) =>
      new AgentLoop(key, workspacePath, task, onUpdate));
  const validateWorkspaceFn = options.validateWorkspaceFn ?? validateWorkspace;
  const getWorkspaceInfoFn = options.getWorkspaceInfoFn ?? getWorkspaceInfo;

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

  const activeSessions = new Map<string, AgentLoop>();
  const sessionTimeouts = new Map<string, NodeJS.Timeout>();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasApiKey: !!apiKey });
  });

  app.post('/api/workspace/validate', async (req, res) => {
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const isValid = await validateWorkspaceFn(path);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid workspace path' });
    }

    const info = await getWorkspaceInfoFn(path);
    res.json(info);
  });

  app.get('/api/session/:sessionId/diffs', (req, res) => {
    const { sessionId } = req.params;
    const agent = activeSessions.get(sessionId);

    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const diffs = agent.getPendingDiffs();
    res.json(diffs);
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    let currentAgent: AgentLoop | null = null;
    let sessionId: string | null = null;

    const onUpdate: UpdateCallback = (update: AgentUpdate) => {
      socket.emit('agent:update', update);
    };

    socket.on('session:resume', (data: { sessionId?: string }) => {
      const requestedId = data?.sessionId;
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

      const timeout = sessionTimeouts.get(requestedId);
      if (timeout) {
        clearTimeout(timeout);
        sessionTimeouts.delete(requestedId);
      }

      socket.emit('session:resumed', { sessionId: requestedId });
      socket.emit('session:diffs', { diffs: currentAgent.getPendingDiffs() });

      socket.emit('agent:update', {
        type: 'info',
        data: {
          message: currentAgent.getState().isRunning
            ? 'Session resumed. Agent is still running.'
            : 'Session resumed.',
        },
      });
    });

    socket.on('task:start', async (data: TaskRequest) => {
      if (!apiKey) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'MOONSHOT_API_KEY environment variable not set' },
        });
        return;
      }

      const { task, workspacePath } = data;

      if (!task || !workspacePath) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Task and workspace path are required' },
        });
        return;
      }

      const isValid = await validateWorkspaceFn(workspacePath);
      if (!isValid) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Invalid workspace path' },
        });
        return;
      }

      if (currentAgent) {
        currentAgent.stop();
      }

      currentAgent = makeAgent(apiKey, workspacePath, task, onUpdate);
      sessionId = currentAgent.getState().taskId;
      activeSessions.set(sessionId, currentAgent);

      const timeout = sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        sessionTimeouts.delete(sessionId);
      }

      socket.emit('session:started', { sessionId });

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
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      currentAgent.addUserMessage(data.message);
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
      if (!currentAgent) {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'No active session' },
        });
        return;
      }

      try {
        const applied = await currentAgent.applyDiff(data.diffId);
        if (applied) {
          socket.emit('diff:applied', {
            diffId: data.diffId,
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

      const rejected = currentAgent.rejectDiff(data.diffId);
      if (rejected) {
        socket.emit('diff:rejected', { diffId: data.diffId, path: rejected.path });
      } else {
        socket.emit('agent:update', {
          type: 'error',
          data: { message: 'Diff not found' },
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (sessionId && currentAgent) {
        const timeout = setTimeout(() => {
          currentAgent?.stop();
          activeSessions.delete(sessionId);
          sessionTimeouts.delete(sessionId);
        }, SESSION_GRACE_MS);
        timeout.unref();
        sessionTimeouts.set(sessionId, timeout);
      }
    });
  });

  const start = (port: number = DEFAULT_PORT) =>
    new Promise<{ port: number }>((resolve) => {
      httpServer.listen(port, () => {
        const address = httpServer.address();
        const actualPort =
          typeof address === 'object' && address ? address.port : port;
        console.log(`Kimi Coding Agent backend running on port ${actualPort}`);
        if (!apiKey) {
          console.warn('Warning: MOONSHOT_API_KEY environment variable not set');
        }
        resolve({ port: actualPort });
      });
    });

  const stop = () =>
    new Promise<void>((resolve, reject) => {
      for (const timeout of sessionTimeouts.values()) {
        clearTimeout(timeout);
      }
      sessionTimeouts.clear();

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
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createBackendServer();
  void server.start(port);
}
