import { useRef, useEffect, useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronRight,
  Wrench,
  ArrowRight,
  AlertCircle,
  Info,
  Brain,
  Copy,
  CheckCircle,
  Clock,
} from 'lucide-react';
import type { LogEntry } from '../types';

interface LogsPaneProps {
  logs: LogEntry[];
  showReasoning: boolean;
}

interface ToolCallData {
  name: string;
  arguments: string;
}

interface ToolResultData {
  toolCallId: string;
  result: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-kimi-light-gray transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle size={12} className="text-kimi-green" />
      ) : (
        <Copy size={12} className="text-kimi-text-muted" />
      )}
    </button>
  );
}

function ToolCallEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const data = log.data as ToolCallData;

  let parsedArgs: Record<string, unknown> = {};
  let argsString = '';
  try {
    parsedArgs = JSON.parse(data.arguments);
    argsString = JSON.stringify(parsedArgs, null, 2);
  } catch {
    argsString = data.arguments;
  }

  // Get a short preview of the arguments
  const getPreview = () => {
    const keys = Object.keys(parsedArgs);
    if (keys.length === 0) return '';
    if (keys.length === 1 && typeof parsedArgs[keys[0]] === 'string') {
      const value = parsedArgs[keys[0]] as string;
      return value.length > 40 ? value.substring(0, 40) + '...' : value;
    }
    return `${keys.length} param${keys.length !== 1 ? 's' : ''}`;
  };

  return (
    <div className="card overflow-hidden animate-fade-in">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-kimi-light-gray/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          {expanded ? (
            <ChevronDown size={14} className="text-kimi-text-muted" />
          ) : (
            <ChevronRight size={14} className="text-kimi-text-muted" />
          )}
          <div className="w-6 h-6 rounded-md bg-kimi-yellow/15 flex items-center justify-center">
            <Wrench size={12} className="text-kimi-yellow" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-kimi-yellow">
              {data.name}
            </span>
            {!expanded && getPreview() && (
              <span className="text-xs text-kimi-text-muted truncate">
                {getPreview()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-kimi-text-muted flex items-center gap-1">
            <Clock size={10} />
            {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <CopyButton text={argsString} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-kimi-darker border-t border-kimi-border">
          <pre className="text-xs font-mono text-kimi-text-secondary whitespace-pre-wrap break-all overflow-x-auto max-h-40 overflow-y-auto">
            {argsString}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolResultEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const data = log.data as ToolResultData;
  const result = data?.result || log.content;

  // Determine if result is likely an error
  const isError = result.toLowerCase().includes('error') || result.toLowerCase().includes('failed');

  // Get truncated preview
  const getPreview = () => {
    const firstLine = result.split('\n')[0];
    return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  };

  return (
    <div className={`card overflow-hidden animate-fade-in ${isError ? 'border-kimi-red/30' : ''}`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-kimi-light-gray/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          {expanded ? (
            <ChevronDown size={14} className="text-kimi-text-muted" />
          ) : (
            <ChevronRight size={14} className="text-kimi-text-muted" />
          )}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
            isError ? 'bg-kimi-red/15' : 'bg-kimi-green/15'
          }`}>
            <ArrowRight size={12} className={isError ? 'text-kimi-red' : 'text-kimi-green'} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className={`text-xs truncate block ${isError ? 'text-kimi-red' : 'text-kimi-text-secondary'}`}>
            {getPreview()}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {result.split('\n').length > 1 && (
            <span className="text-[10px] text-kimi-text-muted">
              {result.split('\n').length} lines
            </span>
          )}
          <CopyButton text={result} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-kimi-darker border-t border-kimi-border">
          <pre className={`text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto ${
            isError ? 'text-kimi-red' : 'text-kimi-text-secondary'
          }`}>
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

function ThinkingEntry({ log, isRunning }: { log: LogEntry; isRunning: boolean }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 animate-fade-in">
      <div className={`w-5 h-5 rounded-md bg-kimi-purple/15 flex items-center justify-center flex-shrink-0 ${
        isRunning ? 'animate-pulse' : ''
      }`}>
        <Brain size={11} className="text-kimi-purple" />
      </div>
      <p className="text-xs text-kimi-text-muted italic leading-relaxed">
        {log.content}
      </p>
    </div>
  );
}

function ErrorEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="card border-kimi-red/30 overflow-hidden animate-fade-in">
      <div
        className="flex items-start gap-2 px-3 py-2.5 bg-kimi-red/5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {expanded ? (
            <ChevronDown size={14} className="text-kimi-red" />
          ) : (
            <ChevronRight size={14} className="text-kimi-red" />
          )}
          <div className="w-6 h-6 rounded-md bg-kimi-red/15 flex items-center justify-center">
            <AlertCircle size={12} className="text-kimi-red" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-kimi-red">Error</span>
          {!expanded && (
            <p className="text-xs text-kimi-red/80 truncate mt-0.5">
              {log.content.split('\n')[0]}
            </p>
          )}
        </div>
        <CopyButton text={log.content} />
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-kimi-darker border-t border-kimi-red/20">
          <pre className="text-xs font-mono text-kimi-red whitespace-pre-wrap break-all">
            {log.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function InfoEntry({ log }: { log: LogEntry }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 animate-fade-in">
      <div className="w-5 h-5 rounded-md bg-kimi-blue/15 flex items-center justify-center flex-shrink-0">
        <Info size={11} className="text-kimi-blue" />
      </div>
      <p className="text-xs text-kimi-text-secondary leading-relaxed">
        {log.content}
      </p>
    </div>
  );
}

export default function LogsPane({ logs, showReasoning }: LogsPaneProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Filter to execution-related logs
  const executionLogs = logs.filter((log) => {
    if (!showReasoning && log.type === 'thinking') return false;
    return ['tool_call', 'tool_result', 'error', 'thinking', 'info'].includes(log.type);
  });

  // Count tool calls
  const toolCallCount = executionLogs.filter((log) => log.type === 'tool_call').length;
  const errorCount = executionLogs.filter((log) => log.type === 'error').length;

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLogs]);

  // Check if agent is currently running (based on last log being thinking)
  const isRunning = executionLogs.length > 0 && executionLogs[executionLogs.length - 1].type === 'thinking';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pane-header">
        <div className="flex items-center gap-3">
          <h2>
            <Terminal size={18} className="text-kimi-green" />
            Logs
          </h2>
          {executionLogs.length > 0 && (
            <div className="flex items-center gap-2">
              {toolCallCount > 0 && (
                <span className="badge badge-warning text-[10px]">
                  {toolCallCount} tool{toolCallCount !== 1 ? 's' : ''}
                </span>
              )}
              {errorCount > 0 && (
                <span className="badge badge-error text-[10px]">
                  {errorCount} error{errorCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-container">
        {executionLogs.length === 0 ? (
          <div className="empty-state mt-8">
            <div className="w-16 h-16 rounded-2xl bg-kimi-gray flex items-center justify-center mb-4">
              <Terminal size={28} className="text-kimi-text-muted opacity-40" />
            </div>
            <h3 className="text-sm font-medium text-kimi-text-secondary mb-1">No activity yet</h3>
            <p className="text-xs text-kimi-text-muted max-w-[200px]">
              Tool calls and execution details will appear here
            </p>
          </div>
        ) : (
          executionLogs.map((log) => {
            switch (log.type) {
              case 'tool_call':
                return <ToolCallEntry key={log.id} log={log} />;
              case 'tool_result':
                return <ToolResultEntry key={log.id} log={log} />;
              case 'thinking':
                return <ThinkingEntry key={log.id} log={log} isRunning={isRunning && log === executionLogs[executionLogs.length - 1]} />;
              case 'error':
                return <ErrorEntry key={log.id} log={log} />;
              default:
                return <InfoEntry key={log.id} log={log} />;
            }
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
