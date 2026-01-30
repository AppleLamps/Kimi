import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, StopCircle, Trash2, Loader2, MessageSquare, Bot, User, Brain, AlertTriangle, Info, Sparkles } from 'lucide-react';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Filter logs to show in chat
  const chatLogs = logs.filter((log) => {
    if (!showReasoning && log.type === 'thinking') return false;
    return ['message', 'error', 'info', 'thinking', 'user'].includes(log.type);
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Reset height to auto to recalculate
    e.target.style.height = 'auto';
    // Set height based on scrollHeight (capped at 120px)
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }, []);

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
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClear = () => {
    onClearLogs();
    setHasStarted(false);
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User size={14} />;
      case 'thinking':
        return <Brain size={14} className={isRunning ? 'animate-pulse' : ''} />;
      case 'error':
        return <AlertTriangle size={14} />;
      case 'info':
        return <Info size={14} />;
      default:
        return <Bot size={14} />;
    }
  };

  const getMessageStyle = (type: string) => {
    switch (type) {
      case 'user':
        return 'message-user ml-8';
      case 'thinking':
        return 'message-thinking';
      case 'error':
        return 'message-error';
      case 'info':
        return 'message-info';
      default:
        return 'message-agent mr-8';
    }
  };

  const getIconContainerStyle = (type: string) => {
    switch (type) {
      case 'user':
        return 'bg-kimi-blue/20 text-kimi-blue';
      case 'thinking':
        return 'bg-kimi-purple/20 text-kimi-purple';
      case 'error':
        return 'bg-kimi-red/20 text-kimi-red';
      case 'info':
        return 'bg-kimi-blue/20 text-kimi-blue';
      default:
        return 'bg-kimi-green/20 text-kimi-green';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pane-header">
        <h2>
          <MessageSquare size={18} className="text-kimi-blue" />
          Chat
        </h2>
        <button
          onClick={handleClear}
          className="btn-ghost p-2 rounded-lg"
          title="Clear chat history"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-container">
        {chatLogs.length === 0 ? (
          <div className="empty-state mt-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-kimi-blue/20 to-kimi-purple/20 flex items-center justify-center mb-6">
              <Sparkles size={36} className="text-kimi-blue" />
            </div>
            <h3 className="text-xl font-semibold text-kimi-text mb-2">
              Welcome to Kimi
            </h3>
            <p className="text-kimi-text-secondary mb-6 max-w-xs">
              Your AI coding assistant. Describe what you want to build or fix.
            </p>
            <div className="space-y-2 text-left">
              <p className="text-xs text-kimi-text-muted mb-3">Try asking:</p>
              {[
                'Add JWT authentication to the FastAPI backend',
                'Refactor the user service to use dependency injection',
                'Fix the memory leak in the WebSocket handler',
              ].map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(example)}
                  className="w-full text-left px-4 py-3 text-sm bg-kimi-gray hover:bg-kimi-light-gray border border-kimi-border rounded-xl transition-colors duration-200"
                >
                  <span className="text-kimi-text-secondary">"</span>
                  <span className="text-kimi-text">{example}</span>
                  <span className="text-kimi-text-secondary">"</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatLogs.map((log, index) => (
            <div
              key={log.id}
              className={`animate-slide-up ${getMessageStyle(log.type)} p-4`}
              style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
            >
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${getIconContainerStyle(log.type)}`}>
                  {getMessageIcon(log.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-kimi-text-secondary">
                      {log.type === 'user' ? 'You' : log.type === 'thinking' ? 'Thinking' : 'Kimi'}
                    </span>
                    <span className="text-xs text-kimi-text-muted">
                      {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-sm whitespace-pre-wrap break-words ${
                    log.type === 'thinking' ? 'text-kimi-text-secondary italic' : 'text-kimi-text'
                  }`}>
                    {log.content}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Typing indicator when running */}
        {isRunning && (
          <div className="flex items-center gap-3 px-4 py-3 animate-fade-in">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-kimi-purple/20">
              <Loader2 size={14} className="text-kimi-purple animate-spin" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-kimi-purple rounded-full animate-typing" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-kimi-purple rounded-full animate-typing" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-kimi-purple rounded-full animate-typing" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-kimi-text-muted">Kimi is working...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-kimi-border bg-kimi-darker/50">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                hasStarted
                  ? 'Send a follow-up message...'
                  : 'Describe your coding task...'
              }
              disabled={!isConnected || isRunning}
              rows={1}
              className="input-primary pr-12 resize-none min-h-[48px]"
            />
            {!isRunning && (
              <button
                type="submit"
                disabled={!input.trim() || !isConnected}
                className="absolute right-2 bottom-2 p-2 rounded-lg bg-kimi-blue hover:bg-kimi-blue-hover disabled:opacity-30 disabled:hover:bg-kimi-blue transition-all duration-200"
              >
                <Send size={16} className="text-white" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-kimi-text-muted">
              <kbd className="kbd">Enter</kbd>
              <span>to send</span>
              <span className="text-kimi-border">|</span>
              <kbd className="kbd">Shift + Enter</kbd>
              <span>for new line</span>
            </div>

            {isRunning && (
              <button
                type="button"
                onClick={onStopTask}
                className="btn-danger py-2 px-4 flex items-center gap-2 text-sm"
              >
                <StopCircle size={16} />
                Stop
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
