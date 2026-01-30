import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AgentUpdate, DiffResult, LogEntry, PersistedAgentState, PersistedLogEntry, SessionRecord } from '../types';
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = 'http://localhost:3001';

interface UseSocketReturn {
  isConnected: boolean;
  isRunning: boolean;
  sessionId: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'failed';
  reconnectAttempt: number;
  connectionMessage: string | null;
  agentState: PersistedAgentState | null;
  logs: LogEntry[];
  pendingDiffs: DiffResult[];
  startTask: (task: string, workspacePath: string) => void;
  resumeSession: (sessionId: string) => void;
  requestSessionState: () => void;
  loadSessionSnapshot: (record: SessionRecord) => void;
  stopTask: () => void;
  continueTask: (message: string) => void;
  applyDiff: (diffId: string) => void;
  rejectDiff: (diffId: string) => void;
  clearLogs: () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stateRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting' | 'failed'>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<PersistedAgentState | null>(null);
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

  const requestSessionState = useCallback(() => {
    const sessionToRequest = sessionIdRef.current;
    if (!socketRef.current || !sessionToRequest) return;
    socketRef.current.emit('session:state:request', { sessionId: sessionToRequest });
  }, []);

  const scheduleSessionStateRequest = useCallback(() => {
    if (!sessionIdRef.current) return;
    if (stateRequestTimeoutRef.current) {
      clearTimeout(stateRequestTimeoutRef.current);
    }
    stateRequestTimeoutRef.current = setTimeout(() => {
      requestSessionState();
    }, 500);
  }, [requestSessionState]);

  const loadSessionSnapshot = useCallback((record: SessionRecord) => {
    setSessionId(record.id);
    sessionIdRef.current = record.id;
    setPendingDiffs(record.pendingDiffs || []);
    setAgentState(record.agentState || null);
    setIsRunning(record.agentState?.isRunning ?? false);

    const restoredLogs = (record.logs || []).map((entry: PersistedLogEntry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
    setLogs(restoredLogs as LogEntry[]);
  }, []);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      setConnectionMessage(null);
      addLog('info', 'Connected to backend');

      const resumeId = sessionIdRef.current;
      if (resumeId) {
        socket.emit('session:resume', { sessionId: resumeId });
      }
    });

    socket.on('connect_error', (error) => {
      setConnectionStatus('reconnecting');
      setConnectionMessage('Unable to connect to backend. Retrying...');
      addLog('error', `Connection error: ${(error as Error).message}`);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempt(attempt);
      setConnectionMessage(`Reconnecting... (attempt ${attempt})`);
      addLog('info', `Reconnecting... (attempt ${attempt})`);
    });

    socket.io.on('reconnect_error', (error) => {
      setConnectionStatus('reconnecting');
      setConnectionMessage('Reconnection failed. Retrying...');
      addLog('error', `Reconnection error: ${(error as Error).message}`);
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionStatus('failed');
      setConnectionMessage('Reconnection failed. Please restart the backend.');
      addLog('error', 'Reconnection failed. Please restart the backend.');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsRunning(false);
      setConnectionStatus('disconnected');
      setConnectionMessage('Disconnected from backend');
      addLog('info', 'Disconnected from backend');
    });

    socket.on('session:started', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setIsRunning(true);
      addLog('info', `Session started: ${data.sessionId}`);
      requestSessionState();
    });

    socket.on('session:resumed', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      addLog('info', `Session resumed: ${data.sessionId}`);
      requestSessionState();
    });

    socket.on('session:diffs', (data: { diffs: DiffResult[] }) => {
      setPendingDiffs(data.diffs || []);
      scheduleSessionStateRequest();
    });

    socket.on('session:state', (data: { state: PersistedAgentState }) => {
      setAgentState(data.state);
    });

    socket.on('session:expired', (data: { message?: string }) => {
      setSessionId(null);
      sessionIdRef.current = null;
      setIsRunning(false);
      const message = data?.message || 'Session expired. Please start a new task.';
      setConnectionMessage(message);
      addLog('error', message);
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
        case 'info': {
          const data = update.data as { message: string };
          addLog('info', data.message);
          break;
        }
      }

      scheduleSessionStateRequest();
    });

    socket.on('diff:applied', (data: { diffId: string; path: string }) => {
      setPendingDiffs((prev) => prev.filter((d) => d.id !== data.diffId));
      addLog('info', `Diff applied: ${data.path}`);
      scheduleSessionStateRequest();
    });

    socket.on('diff:rejected', (data: { diffId: string; path: string }) => {
      setPendingDiffs((prev) => prev.filter((d) => d.id !== data.diffId));
      addLog('info', `Diff rejected: ${data.path}`);
      scheduleSessionStateRequest();
    });

    return () => {
      if (stateRequestTimeoutRef.current) {
        clearTimeout(stateRequestTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, [addLog, requestSessionState, scheduleSessionStateRequest]);

  const startTask = useCallback((task: string, workspacePath: string) => {
    if (socketRef.current) {
      setPendingDiffs([]);
      socketRef.current.emit('task:start', { task, workspacePath });
    }
  }, []);

  const resumeSession = useCallback((targetSessionId: string) => {
    if (!socketRef.current) return;
    sessionIdRef.current = targetSessionId;
    setSessionId(targetSessionId);
    socketRef.current.emit('session:resume', { sessionId: targetSessionId });
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
    connectionStatus,
    reconnectAttempt,
    connectionMessage,
    agentState,
    logs,
    pendingDiffs,
    startTask,
    resumeSession,
    requestSessionState,
    loadSessionSnapshot,
    stopTask,
    continueTask,
    applyDiff,
    rejectDiff,
    clearLogs,
  };
}
