import { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Trash2, Loader2 } from 'lucide-react';
import type { LogEntry } from '../types';

interface TaskPaneProps {
  isRunning: boolean;
  isConnected: boolean;
  logs: LogEntry[];
  showReasoning: boolean;
  onStartTask: (task: string) => void;
  onStopTask: () => void;
  onContinue: (message: string) => void;
  onClearLogs: () => void;
}

export default function TaskPane({
  isRunning,
  isConnected,
  logs,
  showReasoning,
  onStartTask,
  onStopTask,
  onContinue,
  onClearLogs,
}: TaskPaneProps) {
  const [input, setInput] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter logs to show in chat
  const chatLogs = logs.filter((log) => {
    if (!showReasoning && log.type === 'thinking') return false;
    return ['message', 'error', 'info', 'thinking'].includes(log.type);
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;

    if (hasStarted) {
      onContinue(input.trim());
    } else {
      onStartTask(input.trim());
      setHasStarted(true);
    }
    setInput('');
  };

  const handleClear = () => {
    onClearLogs();
    setHasStarted(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-kimi-border flex items-center justify-between">
        <h2 className="font-medium">Task / Chat</h2>
        <button
          onClick={handleClear}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-kimi-light-gray rounded transition-colors"
          title="Clear chat"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatLogs.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">Welcome to Kimi Coding Agent</p>
            <p className="text-sm">
              Describe your coding task below to get started.
            </p>
            <p className="text-xs mt-4 text-gray-600">
              Examples:
              <br />
              "Add JWT authentication to the FastAPI backend"
              <br />
              "Refactor the user service to use dependency injection"
              <br />
              "Fix the memory leak in the WebSocket handler"
            </p>
          </div>
        ) : (
          chatLogs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-lg ${
                log.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/30'
                  : log.type === 'thinking'
                  ? 'bg-kimi-gray/50 text-gray-400 italic'
                  : log.type === 'info'
                  ? 'bg-kimi-blue/10 border border-kimi-blue/30'
                  : 'bg-kimi-gray'
              }`}
            >
              <div className="flex items-start gap-2">
                {log.type === 'thinking' && isRunning && (
                  <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
                )}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {log.content}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {log.timestamp.toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-kimi-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              hasStarted
                ? 'Send a follow-up message...'
                : 'Describe your coding task...'
            }
            disabled={!isConnected || isRunning}
            className="flex-1 px-4 py-2.5 bg-kimi-gray border border-kimi-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-kimi-blue disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isRunning ? (
            <button
              type="button"
              onClick={onStopTask}
              className="px-4 py-2.5 bg-kimi-red hover:bg-red-600 rounded-lg transition-colors flex items-center gap-2"
            >
              <StopCircle size={18} />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !isConnected}
              className="px-4 py-2.5 bg-kimi-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              <Send size={18} />
              {hasStarted ? 'Send' : 'Start'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
