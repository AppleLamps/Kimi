import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AgentUpdate, DiffResult, LogEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = 'http://localhost:3001';

interface UseSocketReturn {
  isConnected: boolean;
  isRunning: boolean;
  sessionId: string | null;
  logs: LogEntry[];
  pendingDiffs: DiffResult[];
  startTask: (task: string, workspacePath: string) => void;
  stopTask: () => void;
  continueTask: (message: string) => void;
  applyDiff: (diffId: string) => void;
  rejectDiff: (diffId: string) => void;
  clearLogs: () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingDiffs, setPendingDiffs] = useState<DiffResult[]>([]);

  const addLog = useCallback((type: LogEntry['type'], content: string, data?: unknown) => {
    const entry: LogEntry = {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      content,
      data,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      addLog('info', 'Connected to backend');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsRunning(false);
      addLog('info', 'Disconnected from backend');
    });

    socket.on('session:started', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      setIsRunning(true);
      addLog('info', `Session started: ${data.sessionId}`);
    });

    socket.on('agent:update', (update: AgentUpdate) => {
      switch (update.type) {
        case 'thinking': {
          const data = update.data as { iteration: number };
          addLog('thinking', `Thinking... (iteration ${data.iteration})`);
          break;
        }
        case 'tool_call': {
          const data = update.data as { name: string; arguments: string };
          addLog('tool_call', `Calling tool: ${data.name}`, data);
          break;
        }
        case 'tool_result': {
          const data = update.data as { toolCallId: string; result: string };
          addLog('tool_result', data.result, data);
          break;
        }
        case 'diff_proposed': {
          const diff = update.data as DiffResult;
          setPendingDiffs((prev) => [...prev, diff]);
          addLog('info', `Diff proposed for: ${diff.path}`);
          break;
        }
        case 'message': {
          const data = update.data as { content: string };
          addLog('message', data.content);
          break;
        }
        case 'complete': {
          const data = update.data as { message: string };
          setIsRunning(false);
          addLog('info', data.message);
          break;
        }
        case 'error': {
          const data = update.data as { message: string };
          addLog('error', data.message);
          break;
        }
      }
    });

    socket.on('diff:applied', (data: { diffId: string; path: string }) => {
      setPendingDiffs((prev) => prev.filter((d) => d.id !== data.diffId));
      addLog('info', `Diff applied: ${data.path}`);
    });

    socket.on('diff:rejected', (data: { diffId: string; path: string }) => {
      setPendingDiffs((prev) => prev.filter((d) => d.id !== data.diffId));
      addLog('info', `Diff rejected: ${data.path}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [addLog]);

  const startTask = useCallback((task: string, workspacePath: string) => {
    if (socketRef.current) {
      setPendingDiffs([]);
      socketRef.current.emit('task:start', { task, workspacePath });
    }
  }, []);

  const stopTask = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('task:stop');
      setIsRunning(false);
    }
  }, []);

  const continueTask = useCallback((message: string) => {
    if (socketRef.current) {
      socketRef.current.emit('task:continue', { message });
      setIsRunning(true);
    }
  }, []);

  const applyDiff = useCallback((diffId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('diff:apply', { diffId });
    }
  }, []);

  const rejectDiff = useCallback((diffId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('diff:reject', { diffId });
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    isConnected,
    isRunning,
    sessionId,
    logs,
    pendingDiffs,
    startTask,
    stopTask,
    continueTask,
    applyDiff,
    rejectDiff,
    clearLogs,
  };
}
