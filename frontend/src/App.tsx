import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import TaskPane from './components/TaskPane';
import DiffPane from './components/DiffPane';
import LogsPane from './components/LogsPane';
import StatusBanner from './components/StatusBanner';
import SessionHistory from './components/SessionHistory';
import ModelConfigPanel from './components/ModelConfigPanel';
import ContextUsagePanel from './components/ContextUsagePanel';
import { getSessionStore } from './utils/sessionStore';
import { prefetchWorkspaceTree } from './utils/workspaceCache';
import type { DiffComment, LogEntry, ModelConfig, PersistedLogEntry, SessionRecord } from './types';
import { FolderOpen, Eye, EyeOff, Sparkles, Zap, Sun, Moon, ChevronDown } from 'lucide-react';

const THEME_STORAGE_KEY = 'kimi.theme';
const WORKSPACE_STORAGE_KEY = 'kimi.recentWorkspaces';

function App() {
  const {
    isConnected,
    isRunning,
    connectionStatus,
    reconnectAttempt,
    connectionMessage,
    gitStatus,
    sessionId,
    agentState,
    logs,
    pendingDiffs,
    progress,
    pinnedFiles,
    contextUsage,
    startTask,
    resumeSession,
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
  } = useSocket();

  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [showReasoningOutput, setShowReasoningOutput] = useState(true);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [currentTaskTitle, setCurrentTaskTitle] = useState('');
  const [diffComments, setDiffComments] = useState<DiffComment[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    model: 'kimi-k2-0711-preview',
    temperature: 0.3,
    maxTokens: 100000,
    baseUrl: '',
  });
  const sessionsRef = useRef<SessionRecord[]>([]);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  const sessionStore = useMemo(() => getSessionStore(), []);

  // Try to get home directory on mount
  useEffect(() => {
    if (window.electronAPI?.getHomeDirectory) {
      window.electronAPI.getHomeDirectory().then((home) => {
        setWorkspacePath(home);
        if (home) {
          setRecentWorkspaces((prev) => {
            const next = [home, ...prev.filter((path) => path !== home)].slice(0, 8);
            localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        }
      });
    }
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    }

    const storedWorkspaces = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (storedWorkspaces) {
      try {
        const parsed = JSON.parse(storedWorkspaces) as string[];
        if (Array.isArray(parsed)) {
          setRecentWorkspaces(parsed);
        }
      } catch {
        setRecentWorkspaces([]);
      }
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isRunning) {
        stopTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, stopTask]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!workspaceMenuRef.current) return;
      if (!workspaceMenuRef.current.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    sessionStore.list().then((stored) => {
      setSessions(stored || []);
    });
  }, [sessionStore]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!workspacePath) return;
    prefetchWorkspaceTree(workspacePath).catch(() => {
      // Ignore failures; cache will populate when backend is available.
    });
  }, [workspacePath]);

  const addRecentWorkspace = useCallback((path: string) => {
    if (!path) return;
    setRecentWorkspaces((prev) => {
      const next = [path, ...prev.filter((item) => item !== path)].slice(0, 8);
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSelectDirectory = async () => {
    if (window.electronAPI?.selectDirectory) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setWorkspacePath(path);
        addRecentWorkspace(path);
      }
    } else {
      // Fallback for browser development
      const path = prompt('Enter workspace path:', workspacePath || '/tmp');
      if (path) {
        setWorkspacePath(path);
        addRecentWorkspace(path);
      }
    }
  };

  const handleStartTask = (task: string) => {
    if (!workspacePath) {
      alert('Please select a workspace directory first');
      return;
    }
    setCurrentTaskTitle(task);
    const normalizedConfig: ModelConfig = {
      ...modelConfig,
      baseUrl: modelConfig.baseUrl?.trim() || undefined,
    };
    startTask(task, workspacePath, normalizedConfig);
  };

  useEffect(() => {
    if (agentState?.modelConfig) {
      setModelConfig((prev) => {
        const next = agentState.modelConfig;
        if (
          prev.model === next.model &&
          prev.temperature === next.temperature &&
          prev.maxTokens === next.maxTokens &&
          (prev.baseUrl || '') === (next.baseUrl || '')
        ) {
          return prev;
        }
        return {
          ...next,
          baseUrl: next.baseUrl || '',
        };
      });
    }
  }, [agentState]);

  const serializeLogs = (entries: LogEntry[]): PersistedLogEntry[] => {
    return entries.map((entry) => ({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    }));
  };

  const stripDiffContent = (diff: DiffResult): DiffResult => {
    const { original, proposed, ...rest } = diff;
    return rest;
  };

  const upsertSessionState = async () => {
    if (!sessionId) return;

    const existing = sessionsRef.current.find((session) => session.id === sessionId);
    const now = new Date().toISOString();
    const title = existing?.title || currentTaskTitle || `Session ${new Date().toLocaleString()}`;

    const record: SessionRecord = {
      id: sessionId,
      title,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      workspacePath: workspacePath || existing?.workspacePath || '',
      logs: serializeLogs(logs),
      pendingDiffs: pendingDiffs.map(stripDiffContent),
      diffComments,
      agentState,
      modelConfig: agentState?.modelConfig ?? modelConfig,
    };

    await sessionStore.upsert(record);
    setSessions((prev) => {
      const next = [...prev];
      const index = next.findIndex((session) => session.id === sessionId);
      if (index >= 0) {
        next[index] = record;
      } else {
        next.unshift(record);
      }
      return next;
    });
  };

  useEffect(() => {
    void upsertSessionState();
  }, [sessionId, logs, pendingDiffs, diffComments, workspacePath, agentState, currentTaskTitle]);

  const handleResumeSession = (record: SessionRecord) => {
    if (record.workspacePath) {
      setWorkspacePath(record.workspacePath);
      addRecentWorkspace(record.workspacePath);
    }
    setCurrentTaskTitle(record.title);
    if (record.modelConfig) {
      setModelConfig({
        ...record.modelConfig,
        baseUrl: record.modelConfig.baseUrl || '',
      });
    }
    setDiffComments(record.diffComments || []);
    loadSessionSnapshot(record);
    resumeSession(record.id);
  };

  const handleExportSession = async (record: SessionRecord) => {
    await sessionStore.export(record);
  };

  const handleImportSession = async () => {
    const imported = await sessionStore.import();
    if (!imported) return;

    const record = imported as SessionRecord;
    if (!record.id) {
      record.id = crypto.randomUUID();
    }
    if (!record.createdAt) {
      record.createdAt = new Date().toISOString();
    }
    record.updatedAt = new Date().toISOString();
    if (!record.modelConfig) {
      record.modelConfig = modelConfig;
    }
    if (!record.diffComments) {
      record.diffComments = [];
    }

    await sessionStore.upsert(record);
    setSessions((prev) => [record, ...prev.filter((session) => session.id !== record.id)]);
  };

  const handleAddDiffComment = (comment: DiffComment) => {
    setDiffComments((prev) => [...prev, comment]);
  };

  const handleDeleteDiffComment = (commentId: string) => {
    setDiffComments((prev) => prev.filter((comment) => comment.id !== commentId));
  };

  const handleSelectWorkspace = (path: string) => {
    setWorkspacePath(path);
    addRecentWorkspace(path);
    setWorkspaceMenuOpen(false);
  };

  const handleGitPull = () => {
    if (!workspacePath) {
      alert('Please select a workspace directory first');
      return;
    }
    if (!window.confirm('Run git pull for the current workspace?')) return;
    gitPull({ workspacePath });
  };

  const handleGitPush = () => {
    if (!workspacePath) {
      alert('Please select a workspace directory first');
      return;
    }
    if (!window.confirm('Run git push for the current workspace?')) return;
    gitPush({ workspacePath });
  };

  // Extract workspace name for display
  const workspaceName = workspacePath ? workspacePath.split('/').pop() || workspacePath : '';
  const progressPercent = progress
    ? Math.min(100, Math.round((progress.total ? (progress.current / progress.total) * 100 : 0)))
    : 0;

  return (
    <div className="h-screen flex flex-col bg-kimi-dark text-kimi-text overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-5 bg-kimi-darker border-b border-kimi-border drag-region">
        <div className="flex items-center gap-5 no-drag">
          {/* Logo and Title */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-kimi-blue to-kimi-purple">
              <Sparkles size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-semibold">
              <span className="gradient-text">Kimi</span>
              <span className="text-kimi-text-secondary font-normal ml-1.5">Coding Agent</span>
            </h1>
          </div>

          {/* Connection Status */}
          <div className="flex items-center">
            {isConnected ? (
              <div className="badge badge-success">
                <span className="status-dot status-dot-connected" />
                Connected
              </div>
            ) : (
              <div className="badge badge-error">
                <span className="status-dot status-dot-disconnected" />
                Disconnected
              </div>
            )}
          </div>

          {/* Running Indicator */}
          {isRunning && (
            <div className="badge badge-purple animate-pulse">
              <Zap size={12} className="animate-bounce-subtle" />
              Agent Running
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 no-drag">
          {/* Workspace Selector */}
          <div className="relative" ref={workspaceMenuRef}>
            <div className="flex items-center">
              <button
                onClick={handleSelectDirectory}
                className="group flex items-center gap-2.5 px-3.5 py-2 bg-kimi-gray hover:bg-kimi-light-gray rounded-l-lg border border-kimi-border hover:border-kimi-border-light transition-all duration-200"
                title={workspacePath || 'Select workspace directory'}
              >
                <FolderOpen size={16} className="text-kimi-yellow" />
                {workspacePath ? (
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-kimi-text-muted">Workspace</span>
                    <span className="text-sm font-medium max-w-40 truncate">{workspaceName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-kimi-text-secondary">Select Workspace</span>
                )}
              </button>
              <button
                onClick={() => setWorkspaceMenuOpen((prev) => !prev)}
                className="px-2.5 py-2 bg-kimi-gray hover:bg-kimi-light-gray rounded-r-lg border border-kimi-border border-l-0 transition-all duration-200"
                title="Switch workspace"
              >
                <ChevronDown size={16} className="text-kimi-text-muted" />
              </button>
            </div>
            {workspaceMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-kimi-border bg-kimi-darker shadow-lg z-50">
                <div className="px-3 py-2 text-xs text-kimi-text-muted">Recent workspaces</div>
                {recentWorkspaces.length === 0 ? (
                  <div className="px-3 pb-3 text-xs text-kimi-text-muted">No recent workspaces.</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    {recentWorkspaces.map((path) => {
                      const name = path.split('/').pop() || path;
                      return (
                        <button
                          key={path}
                          onClick={() => handleSelectWorkspace(path)}
                          className="w-full text-left px-3 py-2 hover:bg-kimi-light-gray/40 transition-colors"
                        >
                          <div className="text-sm text-kimi-text truncate">{name}</div>
                          <div className="text-[10px] text-kimi-text-muted truncate">{path}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 bg-kimi-gray text-kimi-text-secondary border border-kimi-border hover:bg-kimi-light-gray"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span className="text-sm font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {/* Reasoning Toggle */}
          <button
            onClick={() => setShowReasoningOutput(!showReasoningOutput)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${showReasoningOutput
              ? 'bg-kimi-purple/20 text-kimi-purple border border-kimi-purple/30'
              : 'bg-kimi-gray text-kimi-text-secondary border border-kimi-border hover:bg-kimi-light-gray'
              }`}
            title={showReasoningOutput ? 'Hide agent reasoning' : 'Show agent reasoning'}
          >
            {showReasoningOutput ? <Eye size={16} /> : <EyeOff size={16} />}
            <span className="text-sm font-medium">Reasoning</span>
          </button>
        </div>
      </header>

      <StatusBanner
        status={connectionStatus}
        attempt={reconnectAttempt}
        message={connectionMessage}
        gitStatus={gitStatus}
        onPull={handleGitPull}
        onPush={handleGitPush}
      />

      {isRunning && progress && (
        <div className="px-5 py-2 border-b border-kimi-border bg-kimi-darker/40">
          <div className="flex items-center justify-between text-xs text-kimi-text-muted">
            <span>Processing...</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="progress-bar mt-2">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Task/Chat Pane */}
        <div className="w-[380px] min-w-[320px] border-r border-kimi-border flex flex-col bg-kimi-darker/30">
          <SessionHistory
            sessions={sessions}
            searchValue={sessionSearch}
            onSearchChange={setSessionSearch}
            onResume={handleResumeSession}
            onExport={handleExportSession}
            onImport={handleImportSession}
          />
          <ModelConfigPanel
            config={modelConfig}
            onChange={setModelConfig}
          />
          <ContextUsagePanel
            pinnedFiles={pinnedFiles}
            contextUsage={contextUsage}
            onUnpinFile={unpinFile}
          />
          <div className="flex-1 min-h-0">
            <TaskPane
              isRunning={isRunning}
              isConnected={isConnected}
              logs={logs}
              showReasoning={showReasoningOutput}
              onStartTask={handleStartTask}
              onStopTask={stopTask}
              onContinue={continueTask}
              onClearLogs={clearLogs}
            />
          </div>
        </div>

        {/* Center: Diff Review Pane */}
        <div className="flex-1 min-w-[400px] border-r border-kimi-border flex flex-col">
          <DiffPane
            diffs={pendingDiffs}
            comments={diffComments}
            sessionId={sessionId}
            pinnedFiles={pinnedFiles}
            onApply={applyDiff}
            onReject={rejectDiff}
            onApplyAll={applyAllDiffs}
            onRejectAll={rejectAllDiffs}
            onAddComment={handleAddDiffComment}
            onDeleteComment={handleDeleteDiffComment}
            onPinFile={pinFile}
          />
        </div>

        {/* Right: Execution/Logs Pane */}
        <div className="w-[320px] min-w-[280px] flex flex-col bg-kimi-darker/30">
          <LogsPane logs={logs} showReasoning={showReasoningOutput} />
        </div>
      </main>
    </div>
  );
}

export default App;
