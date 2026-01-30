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

function ToolCallEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const data = log.data as ToolCallData;

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(data.arguments);
  } catch {
    // ignore
  }

  return (
    <div className="border border-kimi-border rounded overflow-hidden">
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-kimi-gray cursor-pointer hover:bg-kimi-light-gray transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} className="text-kimi-yellow" />
        <span className="font-mono text-xs text-kimi-yellow">{data.name}</span>
        <span className="text-xs text-gray-500">
          {log.timestamp.toLocaleTimeString()}
        </span>
      </div>
      {expanded && (
        <div className="p-2 bg-kimi-darker text-xs font-mono overflow-x-auto">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(parsedArgs, null, 2)}
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

  const truncatedResult =
    result.length > 100 ? result.substring(0, 100) + '...' : result;

  return (
    <div className="border border-kimi-border rounded overflow-hidden">
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-kimi-gray cursor-pointer hover:bg-kimi-light-gray transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ArrowRight size={14} className="text-kimi-green" />
        <span className="text-xs text-gray-400 truncate flex-1">
          {truncatedResult}
        </span>
        <span className="text-xs text-gray-500">
          {log.timestamp.toLocaleTimeString()}
        </span>
      </div>
      {expanded && (
        <div className="p-2 bg-kimi-darker text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-all">{result}</pre>
        </div>
      )}
    </div>
  );
}

export default function LogsPane({ logs, showReasoning }: LogsPaneProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Filter to execution-related logs
  const executionLogs = logs.filter((log) => {
    if (!showReasoning && log.type === 'thinking') return false;
    return ['tool_call', 'tool_result', 'error', 'thinking'].includes(log.type);
  });

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLogs]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-kimi-border flex items-center gap-2">
        <Terminal size={16} />
        <h2 className="font-medium">Execution Logs</h2>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {executionLogs.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <Terminal size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Tool calls and command outputs will appear here</p>
          </div>
        ) : (
          executionLogs.map((log) => {
            switch (log.type) {
              case 'tool_call':
                return <ToolCallEntry key={log.id} log={log} />;
              case 'tool_result':
                return <ToolResultEntry key={log.id} log={log} />;
              case 'thinking':
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 italic"
                  >
                    <Brain size={12} className="animate-pulse" />
                    <span>{log.content}</span>
                  </div>
                );
              case 'error':
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 px-2 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400"
                  >
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span className="break-words">{log.content}</span>
                  </div>
                );
              default:
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 px-2 py-1 text-xs text-gray-400"
                  >
                    <Info size={12} className="flex-shrink-0 mt-0.5" />
                    <span className="break-words">{log.content}</span>
                  </div>
                );
            }
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
