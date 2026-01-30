import { useRef, useEffect, useMemo, useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Wrench,
  ArrowRight,
  AlertCircle,
  Info,
  Brain,
  Copy,
  CheckCircle,
  Clock,
  FileDown,
  Search,
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

function ToolCallEntry({
  log,
  forceExpanded,
  onManualToggle,
}: {
  log: LogEntry;
  forceExpanded: boolean | null;
  onManualToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(forceExpanded ?? false);
  const data = log.data as ToolCallData;

  useEffect(() => {
    if (forceExpanded !== null) {
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);

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
        onClick={() => {
          if (forceExpanded !== null) onManualToggle();
          setExpanded(!expanded);
        }}
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

function ToolResultEntry({
  log,
  forceExpanded,
  onManualToggle,
}: {
  log: LogEntry;
  forceExpanded: boolean | null;
  onManualToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(forceExpanded ?? false);
  const data = log.data as ToolResultData;
  const result = data?.result || log.content;

  useEffect(() => {
    if (forceExpanded !== null) {
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);

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
        onClick={() => {
          if (forceExpanded !== null) onManualToggle();
          setExpanded(!expanded);
        }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          {expanded ? (
            <ChevronDown size={14} className="text-kimi-text-muted" />
          ) : (
            <ChevronRight size={14} className="text-kimi-text-muted" />
          )}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isError ? 'bg-kimi-red/15' : 'bg-kimi-green/15'
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
          <pre className={`text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto ${isError ? 'text-kimi-red' : 'text-kimi-text-secondary'
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
      <div className={`w-5 h-5 rounded-md bg-kimi-purple/15 flex items-center justify-center flex-shrink-0 ${isRunning ? 'animate-pulse' : ''
        }`}>
        <Brain size={11} className="text-kimi-purple" />
      </div>
      <p className="text-xs text-kimi-text-muted italic leading-relaxed">
        {log.content}
      </p>
    </div>
  );
}

function ErrorEntry({
  log,
  forceExpanded,
  onManualToggle,
}: {
  log: LogEntry;
  forceExpanded: boolean | null;
  onManualToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(forceExpanded ?? true);

  useEffect(() => {
    if (forceExpanded !== null) {
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  return (
    <div className="card border-kimi-red/30 overflow-hidden animate-fade-in">
      <div
        className="flex items-start gap-2 px-3 py-2.5 bg-kimi-red/5 cursor-pointer"
        onClick={() => {
          if (forceExpanded !== null) onManualToggle();
          setExpanded(!expanded);
        }}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAllState, setExpandAllState] = useState<boolean | null>(null);
  const [severityFilters, setSeverityFilters] = useState({
    tool: true,
    error: true,
    thinking: true,
    info: true,
  });

  const getSeverityForType = (type: LogEntry['type']) => {
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
  };

  const executionLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!showReasoning && log.type === 'thinking') return false;
      return ['tool_call', 'tool_result', 'error', 'thinking', 'info'].includes(log.type);
    });
  }, [logs, showReasoning]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return executionLogs.filter((log) => {
      const severity = log.severity ?? getSeverityForType(log.type);
      const passesSeverity =
        (severity === 'tool' && severityFilters.tool) ||
        (severity === 'error' && severityFilters.error) ||
        (severity === 'thinking' && severityFilters.thinking) ||
        (severity === 'info' && severityFilters.info);

      if (!passesSeverity) return false;
      if (!query) return true;

      const dataText = log.data ? JSON.stringify(log.data) : '';
      const combined = `${log.content} ${dataText}`.toLowerCase();
      return combined.includes(query);
    });
  }, [executionLogs, searchQuery, severityFilters]);

  // Count tool calls
  const toolCallCount = filteredLogs.filter((log) => log.type === 'tool_call').length;
  const errorCount = filteredLogs.filter((log) => log.type === 'error').length;

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredLogs]);

  // Check if agent is currently running (based on last log being thinking)
  const isRunning = executionLogs.length > 0 && executionLogs[executionLogs.length - 1].type === 'thinking';

  const toggleSeverity = (key: keyof typeof severityFilters) => {
    setSeverityFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleManualExpandToggle = () => {
    setExpandAllState(null);
  };

  const hasExpandableEntries = filteredLogs.some((log) =>
    ['tool_call', 'tool_result', 'error'].includes(log.type)
  );

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportLogsAsJson = () => {
    const payload = filteredLogs.map((log) => ({
      ...log,
      severity: log.severity ?? getSeverityForType(log.type),
      timestamp: log.timestamp.toISOString(),
    }));
    const json = JSON.stringify(payload, null, 2);
    downloadTextFile(json, `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  };

  const exportLogsAsText = () => {
    const lines = filteredLogs.map((log) => {
      const severity = (log.severity ?? getSeverityForType(log.type)).toUpperCase();
      const header = `[${log.timestamp.toLocaleString()}] [${severity}] [${log.type}] ${log.content}`;
      if (!log.data) return header;
      const dataBlock = JSON.stringify(log.data, null, 2);
      return `${header}\n${dataBlock}`;
    });
    downloadTextFile(lines.join('\n\n'), `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pane-header">
        <div className="flex items-center gap-3">
          <h2>
            <Terminal size={18} className="text-kimi-green" />
            Logs
          </h2>
          {filteredLogs.length > 0 && (
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpandAllState(true)}
            disabled={!hasExpandableEntries}
            className="btn-ghost px-2 py-1 text-[10px] rounded-md disabled:opacity-40"
            title="Expand all"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => setExpandAllState(false)}
            disabled={!hasExpandableEntries}
            className="btn-ghost px-2 py-1 text-[10px] rounded-md disabled:opacity-40"
            title="Collapse all"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={exportLogsAsJson}
            className="btn-ghost px-2 py-1 text-[10px] rounded-md"
            title="Export logs as JSON"
          >
            <FileDown size={12} />
          </button>
          <button
            onClick={exportLogsAsText}
            className="btn-ghost px-2 py-1 text-[10px] rounded-md"
            title="Export logs as text"
          >
            <FileDown size={12} />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-kimi-text-muted" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search logs..."
            className="w-full bg-kimi-gray border border-kimi-border rounded-lg pl-9 pr-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleSeverity('error')}
            className={`text-[10px] px-2.5 py-1 rounded-md border ${severityFilters.error
              ? 'bg-kimi-red/15 border-kimi-red/30 text-kimi-red'
              : 'bg-kimi-gray border-kimi-border text-kimi-text-muted'
              }`}
          >
            Errors
          </button>
          <button
            onClick={() => toggleSeverity('tool')}
            className={`text-[10px] px-2.5 py-1 rounded-md border ${severityFilters.tool
              ? 'bg-kimi-yellow/15 border-kimi-yellow/30 text-kimi-yellow'
              : 'bg-kimi-gray border-kimi-border text-kimi-text-muted'
              }`}
          >
            Tool calls
          </button>
          <button
            onClick={() => toggleSeverity('thinking')}
            className={`text-[10px] px-2.5 py-1 rounded-md border ${severityFilters.thinking
              ? 'bg-kimi-purple/15 border-kimi-purple/30 text-kimi-purple'
              : 'bg-kimi-gray border-kimi-border text-kimi-text-muted'
              }`}
          >
            Thinking
          </button>
          <button
            onClick={() => toggleSeverity('info')}
            className={`text-[10px] px-2.5 py-1 rounded-md border ${severityFilters.info
              ? 'bg-kimi-blue/15 border-kimi-blue/30 text-kimi-blue'
              : 'bg-kimi-gray border-kimi-border text-kimi-text-muted'
              }`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-container">
        {filteredLogs.length === 0 ? (
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
          filteredLogs.map((log) => {
            switch (log.type) {
              case 'tool_call':
                return (
                  <ToolCallEntry
                    key={log.id}
                    log={log}
                    forceExpanded={expandAllState}
                    onManualToggle={handleManualExpandToggle}
                  />
                );
              case 'tool_result':
                return (
                  <ToolResultEntry
                    key={log.id}
                    log={log}
                    forceExpanded={expandAllState}
                    onManualToggle={handleManualExpandToggle}
                  />
                );
              case 'thinking':
                return (
                  <ThinkingEntry
                    key={log.id}
                    log={log}
                    isRunning={isRunning && log === executionLogs[executionLogs.length - 1]}
                  />
                );
              case 'error':
                return (
                  <ErrorEntry
                    key={log.id}
                    log={log}
                    forceExpanded={expandAllState}
                    onManualToggle={handleManualExpandToggle}
                  />
                );
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
