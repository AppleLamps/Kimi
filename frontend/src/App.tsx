import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import TaskPane from './components/TaskPane';
import DiffPane from './components/DiffPane';
import LogsPane from './components/LogsPane';
import StatusBanner from './components/StatusBanner';
import { FolderOpen, Wifi, WifiOff, Eye, EyeOff, Sparkles, Zap } from 'lucide-react';

function App() {
  const {
    isConnected,
    isRunning,
    connectionStatus,
    reconnectAttempt,
    connectionMessage,
    logs,
    pendingDiffs,
    startTask,
    stopTask,
    continueTask,
    applyDiff,
    rejectDiff,
    clearLogs,
  } = useSocket();

  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [showReasoningOutput, setShowReasoningOutput] = useState(true);

  // Try to get home directory on mount
  useEffect(() => {
    if (window.electronAPI?.getHomeDirectory) {
      window.electronAPI.getHomeDirectory().then((home) => {
        setWorkspacePath(home);
      });
    }
  }, []);

  const handleSelectDirectory = async () => {
    if (window.electronAPI?.selectDirectory) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setWorkspacePath(path);
      }
    } else {
      // Fallback for browser development
      const path = prompt('Enter workspace path:', workspacePath || '/tmp');
      if (path) {
        setWorkspacePath(path);
      }
    }
  };

  const handleStartTask = (task: string) => {
    if (!workspacePath) {
      alert('Please select a workspace directory first');
      return;
    }
    startTask(task, workspacePath);
  };

  // Extract workspace name for display
  const workspaceName = workspacePath ? workspacePath.split('/').pop() || workspacePath : '';

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
          <button
            onClick={handleSelectDirectory}
            className="group flex items-center gap-2.5 px-3.5 py-2 bg-kimi-gray hover:bg-kimi-light-gray rounded-lg border border-kimi-border hover:border-kimi-border-light transition-all duration-200"
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
      />

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Task/Chat Pane */}
        <div className="w-[380px] min-w-[320px] border-r border-kimi-border flex flex-col bg-kimi-darker/30">
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

        {/* Center: Diff Review Pane */}
        <div className="flex-1 min-w-[400px] border-r border-kimi-border flex flex-col">
          <DiffPane
            diffs={pendingDiffs}
            onApply={applyDiff}
            onReject={rejectDiff}
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
