import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { AgentLoop, UpdateCallback } from './agent/agentLoop.js';
import { validateWorkspace, getWorkspaceInfo } from './workspace/workspace.js';
import type { TaskRequest, AgentUpdate } from './types.js';

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.MOONSHOT_API_KEY || '';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Store active agent sessions
const activeSessions = new Map<string, AgentLoop>();

// REST endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY });
});

app.post('/api/workspace/validate', async (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }

  const isValid = await validateWorkspace(path);
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid workspace path' });
  }

  const info = await getWorkspaceInfo(path);
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

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  let currentAgent: AgentLoop | null = null;
  let sessionId: string | null = null;

  // Create update callback for this socket
  const onUpdate: UpdateCallback = (update: AgentUpdate) => {
    socket.emit('agent:update', update);
  };

  // Start a new task
  socket.on('task:start', async (data: TaskRequest) => {
    if (!API_KEY) {
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

    // Validate workspace
    const isValid = await validateWorkspace(workspacePath);
    if (!isValid) {
      socket.emit('agent:update', {
        type: 'error',
        data: { message: 'Invalid workspace path' },
      });
      return;
    }

    // Stop existing agent if any
    if (currentAgent) {
      currentAgent.stop();
    }

    // Create new agent
    currentAgent = new AgentLoop(API_KEY, workspacePath, task, onUpdate);
    sessionId = currentAgent.getState().taskId;
    activeSessions.set(sessionId, currentAgent);

    socket.emit('session:started', { sessionId });

    // Start the agent loop
    try {
      await currentAgent.start();
    } catch (error) {
      socket.emit('agent:update', {
        type: 'error',
        data: { message: (error as Error).message },
      });
    }
  });

  // Stop current task
  socket.on('task:stop', () => {
    if (currentAgent) {
      currentAgent.stop();
      socket.emit('agent:update', {
        type: 'message',
        data: { content: 'Task stopped by user' },
      });
    }
  });

  // Continue with follow-up message
  socket.on('task:continue', async (data: { message: string }) => {
    if (!currentAgent) {
      socket.emit('agent:update', {
        type: 'error',
        data: { message: 'No active session' },
      });
      return;
    }

    currentAgent.addUserMessage(data.message);
    await currentAgent.start();
  });

  // Apply a proposed diff
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
        socket.emit('diff:applied', { diffId: data.diffId, path: applied.path });
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

  // Reject a proposed diff
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

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (currentAgent) {
      currentAgent.stop();
    }
    if (sessionId) {
      activeSessions.delete(sessionId);
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Kimi Coding Agent backend running on port ${PORT}`);
  if (!API_KEY) {
    console.warn('Warning: MOONSHOT_API_KEY environment variable not set');
  }
});
