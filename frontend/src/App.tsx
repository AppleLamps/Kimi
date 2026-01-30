import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import TaskPane from './components/TaskPane';
import DiffPane from './components/DiffPane';
import LogsPane from './components/LogsPane';
import { FolderOpen, Wifi, WifiOff } from 'lucide-react';

function App() {
  const {
    isConnected,
    isRunning,
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

  return (
    <div className="h-screen flex flex-col bg-kimi-dark text-white overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-kimi-darker border-b border-kimi-border drag-region">
        <div className="flex items-center gap-4 no-drag">
          <h1 className="text-lg font-semibold text-kimi-blue">Kimi Coding Agent</h1>
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <span className="flex items-center gap-1 text-kimi-green">
                <Wifi size={14} />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-kimi-red">
                <WifiOff size={14} />
                Disconnected
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 no-drag">
          <button
            onClick={handleSelectDirectory}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-kimi-gray hover:bg-kimi-light-gray rounded border border-kimi-border transition-colors"
          >
            <FolderOpen size={14} />
            {workspacePath ? (
              <span className="max-w-48 truncate">{workspacePath}</span>
            ) : (
              'Select Workspace'
            )}
          </button>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showReasoningOutput}
              onChange={(e) => setShowReasoningOutput(e.target.checked)}
              className="rounded border-kimi-border bg-kimi-gray"
            />
            Show reasoning
          </label>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Task/Chat Pane */}
        <div className="w-1/3 min-w-80 border-r border-kimi-border flex flex-col">
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
        <div className="flex-1 min-w-96 border-r border-kimi-border flex flex-col">
          <DiffPane
            diffs={pendingDiffs}
            onApply={applyDiff}
            onReject={rejectDiff}
          />
        </div>

        {/* Right: Execution/Logs Pane */}
        <div className="w-1/4 min-w-72 flex flex-col">
          <LogsPane logs={logs} showReasoning={showReasoningOutput} />
        </div>
      </main>
    </div>
  );
}

export default App;
