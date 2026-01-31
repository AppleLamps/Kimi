import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AgentUpdate, DiffResult, GitOperationRequest, GitOperationResult, LogEntry, LogSeverity, ModelConfig, PersistedAgentState, PersistedLogEntry, ProgressData, SessionRecord, TokenUsage } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { frontendConfig } from '../config';
import type { PinnedFile, ContextUsage } from '../types';

const BACKEND_URL = frontendConfig.backendUrl;
const DELTA_FLUSH_INTERVAL_MS = frontendConfig.socket.deltaFlushIntervalMs;

interface UseSocketReturn {
  isConnected: boolean;
  isRunning: boolean;
  sessionId: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'failed';
  reconnectAttempt: number;
  connectionMessage: string | null;
  gitStatus: GitStatus;
  agentState: PersistedAgentState | null;
  logs: LogEntry[];
  pendingDiffs: DiffResult[];
  progress: ProgressData | null;
  pinnedFiles: PinnedFile[];
  contextUsage: ContextUsage | null;
  startTask: (task: string, workspacePath: string, modelConfig: ModelConfig) => void;
  resumeSession: (sessionId: string) => void;
  requestSessionState: () => void;
  loadSessionSnapshot: (record: SessionRecord) => void;
  stopTask: () => void;
  continueTask: (message: string) => void;
  applyDiff: (diffId: string) => void;
  rejectDiff: (diffId: string) => void;
  applyAllDiffs: () => void;
  rejectAllDiffs: () => void;
  clearLogs: () => void;
  gitPull: (request: GitOperationRequest) => void;
  gitPush: (request: GitOperationRequest) => void;
  pinFile: (path: string) => void;
  unpinFile: (path: string) => void;
}

interface GitStatus {
  state: 'idle' | 'running' | 'success' | 'error';
  message: string | null;
  action?: 'pull' | 'push';
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stateRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deltaBufferRef = useRef<Map<string, string>>(new Map());
  const deltaFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting' | 'failed'>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus>({ state: 'idle', message: null });
  const [agentState, setAgentState] = useState<PersistedAgentState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingDiffs, setPendingDiffs] = useState<DiffResult[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [pinnedFiles, setPinnedFiles] = useState<PinnedFile[]>([]);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);

  const getSeverityForType = useCallback((type: LogEntry['type']): LogSeverity => {
    switch (type) {
      case 'tool_call':
      case 'tool_result':
        return 'tool';
      case 'thinking':
        return 'thinking';
      case 'error':
        return 'error';
      case 'message':
      case 'user':
      case 'info':
      default:
        return 'info';
    }
  }, []);

  const addLog = useCallback((type: LogEntry['type'], content: string, data?: unknown) => {
    const entry: LogEntry = {
      id: uuidv4(),
      type,
      severity: getSeverityForType(type),
      timestamp: new Date(),
      content,
      data,
    };
    setLogs((prev) => [...prev, entry]);
  }, [getSeverityForType]);

  const flushBufferedDeltas = useCallback(() => {
    if (deltaBufferRef.current.size === 0) return;

    const buffered = new Map(deltaBufferRef.current);
    deltaBufferRef.current.clear();

    setLogs((prev) => {
      const next = [...prev];

      buffered.forEach((delta, messageId) => {
        const index = next.findIndex((entry) => entry.id === messageId);
        if (index === -1) {
          next.push({
            id: messageId,
            type: 'message',
            severity: getSeverityForType('message'),
            timestamp: new Date(),
            content: delta,
          });
        } else {
          const existing = next[index];
          next[index] = {
            ...existing,
            content: existing.content + delta,
          };
        }
      });

      return next;
    });
  }, [getSeverityForType]);

  const scheduleDeltaFlush = useCallback(() => {
    if (deltaFlushTimerRef.current) return;
    deltaFlushTimerRef.current = setTimeout(() => {
      deltaFlushTimerRef.current = null;
      flushBufferedDeltas();
    }, DELTA_FLUSH_INTERVAL_MS);
  }, [flushBufferedDeltas]);

  const upsertMessageLog = useCallback((messageId: string, content: string, usage?: TokenUsage, replaceContent: boolean = false) => {
    setLogs((prev) => {
      const index = prev.findIndex((entry) => entry.id === messageId);
      if (index === -1) {
        return [
          ...prev,
          {
            id: messageId,
            type: 'message',
            severity: getSeverityForType('message'),
            timestamp: new Date(),
            content,
            data: usage ? { usage } : undefined,
          },
        ];
      }

      const next = [...prev];
      const existing = next[index];
      next[index] = {
        ...existing,
        content: replaceContent ? content : existing.content + content,
        data: usage ? { usage } : existing.data,
      };
      return next;
    });
  }, [getSeverityForType]);

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
    }, frontendConfig.socket.stateRequestDelayMs);
  }, [requestSessionState]);

  const loadSessionSnapshot = useCallback((record: SessionRecord) => {
    setSessionId(record.id);
    sessionIdRef.current = record.id;
    setPendingDiffs(record.pendingDiffs || []);
    setAgentState(record.agentState || null);
    setIsRunning(record.agentState?.isRunning ?? false);

    const restoredLogs = (record.logs || []).map((entry: PersistedLogEntry) => ({
      ...entry,
      severity: entry.severity ?? getSeverityForType(entry.type),
      timestamp: new Date(entry.timestamp),
    }));
    setLogs(restoredLogs as LogEntry[]);
  }, [getSeverityForType]);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: frontendConfig.socket.reconnectAttempts,
      reconnectionDelay: frontendConfig.socket.reconnectDelayMs,
      reconnectionDelayMax: frontendConfig.socket.reconnectDelayMaxMs,
      randomizationFactor: frontendConfig.socket.reconnectRandomizationFactor,
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
      setProgress(null);
      addLog('info', `Session started: ${data.sessionId}`);
      requestSessionState();
    });

    socket.on('session:resumed', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setProgress(null);
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
      setProgress(null);
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
          const data = update.data as { content: string; usage?: TokenUsage; messageId?: string | null };
          if (data.messageId) {
            if (deltaBufferRef.current.has(data.messageId)) {
              deltaBufferRef.current.delete(data.messageId);
            }
            upsertMessageLog(data.messageId, data.content, data.usage, true);
          } else {
            addLog('message', data.content, { usage: data.usage });
          }
          break;
        }
        case 'message_delta': {
          const data = update.data as { messageId: string; delta: string };
          const existing = deltaBufferRef.current.get(data.messageId) ?? '';
          deltaBufferRef.current.set(data.messageId, existing + data.delta);
          scheduleDeltaFlush();
          break;
        }
        case 'complete': {
          const data = update.data as { message: string };
          setIsRunning(false);
          setProgress({ current: 100, total: 100, stage: 'complete' });
          addLog('info', data.message);
          break;
        }
        case 'error': {
          const data = update.data as { message: string };
          setProgress(null);
          addLog('error', data.message);
          break;
        }
        case 'info': {
          const data = update.data as { message: string };
          addLog('info', data.message);
          break;
        }
        case 'progress': {
          const data = update.data as ProgressData;
          setProgress(data);
          break;
        }
        case 'context_update': {
          const data = update.data as { pinnedFiles: PinnedFile[]; contextUsage: ContextUsage };
          setPinnedFiles(data.pinnedFiles);
          setContextUsage(data.contextUsage);
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

    socket.on('git:started', (data: { action: 'pull' | 'push' }) => {
      setGitStatus({ state: 'running', action: data.action, message: `Running git ${data.action}...` });
    });

    socket.on('git:result', (data: GitOperationResult) => {
      setGitStatus({ state: 'success', action: data.action, message: `Git ${data.action} completed.` });
      addLog('info', `Git ${data.action} completed.`);
      setTimeout(() => {
        setGitStatus({ state: 'idle', message: null });
      }, frontendConfig.socket.gitStatusResetMs);
    });

    socket.on('git:error', (data: { action: 'pull' | 'push'; message: string }) => {
      setGitStatus({ state: 'error', action: data.action, message: data.message });
      addLog('error', `Git ${data.action} failed: ${data.message}`);
      setTimeout(() => {
        setGitStatus({ state: 'idle', message: null });
      }, frontendConfig.socket.gitErrorResetMs);
    });

    return () => {
      if (stateRequestTimeoutRef.current) {
        clearTimeout(stateRequestTimeoutRef.current);
      }
      if (deltaFlushTimerRef.current) {
        clearTimeout(deltaFlushTimerRef.current);
      }
      flushBufferedDeltas();
      socket.disconnect();
    };
  }, [addLog, flushBufferedDeltas, requestSessionState, scheduleDeltaFlush, scheduleSessionStateRequest, upsertMessageLog]);

  const startTask = useCallback((task: string, workspacePath: string, modelConfig: ModelConfig) => {
    if (socketRef.current) {
      setPendingDiffs([]);
      socketRef.current.emit('task:start', { task, workspacePath, modelConfig });
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
      setProgress(null);
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

  const applyAllDiffs = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('diff:apply_all');
    }
  }, []);

  const rejectAllDiffs = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('diff:reject_all');
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const gitPull = useCallback((request: GitOperationRequest) => {
    if (socketRef.current) {
      socketRef.current.emit('git:pull', request);
    }
  }, []);

  const gitPush = useCallback((request: GitOperationRequest) => {
    if (socketRef.current) {
      socketRef.current.emit('git:push', request);
    }
  }, []);

  const pinFile = useCallback((path: string) => {
    if (socketRef.current) {
      socketRef.current.emit('file:pin', { path });
    }
  }, []);

  const unpinFile = useCallback((path: string) => {
    if (socketRef.current) {
      socketRef.current.emit('file:unpin', { path });
    }
  }, []);

  return {
    isConnected,
    isRunning,
    sessionId,
    connectionStatus,
    reconnectAttempt,
    connectionMessage,
    gitStatus,
    agentState,
    logs,
    pendingDiffs,
    progress,
    pinnedFiles,
    contextUsage,
    startTask,
    resumeSession,
    requestSessionState,
    loadSessionSnapshot,
    stopTask,
    continueTask,
    applyDiff,
    rejectDiff,
    applyAllDiffs,
    rejectAllDiffs,
    clearLogs,
    gitPull,
    gitPush,
    pinFile,
    unpinFile,
  };
}
