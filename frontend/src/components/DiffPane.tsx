import { useState } from 'react';
import { Check, X, ChevronDown, ChevronRight, FileCode, FilePlus, FileEdit, CheckCheck, XCircle, Copy, CheckCircle } from 'lucide-react';
import type { DiffResult } from '../types';

interface DiffPaneProps {
  diffs: DiffResult[];
  onApply: (diffId: string) => void;
  onReject: (diffId: string) => void;
}

interface DiffViewerProps {
  diff: DiffResult;
  onApply: () => void;
  onReject: () => void;
}

function parseDiff(diffText: string): Array<{
  type: 'header' | 'add' | 'remove' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}> {
  const lines = diffText.split('\n');
  const result: Array<{
    type: 'header' | 'add' | 'remove' | 'context';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }> = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('===')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      result.push({
        type: 'add',
        content: line.substring(1),
        newLineNum: newLine++,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'remove',
        content: line.substring(1),
        oldLineNum: oldLine++,
      });
    } else if (line.startsWith(' ')) {
      result.push({
        type: 'context',
        content: line.substring(1),
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    } else if (line.length > 0) {
      result.push({
        type: 'context',
        content: line,
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  return result;
}

function DiffViewer({ diff, onApply, onReject }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const parsedLines = parseDiff(diff.diff);

  const addedLines = parsedLines.filter((l) => l.type === 'add').length;
  const removedLines = parsedLines.filter((l) => l.type === 'remove').length;
  const isNewFile = !diff.original;

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(diff.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract filename from path
  const fileName = diff.path.split('/').pop() || diff.path;
  const dirPath = diff.path.split('/').slice(0, -1).join('/');

  return (
    <div className="card card-hover overflow-hidden mb-4 animate-slide-up">
      {/* File header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-kimi-gray/50 cursor-pointer hover:bg-kimi-light-gray/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown size={16} className="text-kimi-text-muted flex-shrink-0" />
            ) : (
              <ChevronRight size={16} className="text-kimi-text-muted flex-shrink-0" />
            )}
            {isNewFile ? (
              <FilePlus size={16} className="text-kimi-green flex-shrink-0" />
            ) : (
              <FileEdit size={16} className="text-kimi-blue flex-shrink-0" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-kimi-text truncate">
                {fileName}
              </span>
              {isNewFile ? (
                <span className="badge badge-success text-[10px] py-0.5">NEW</span>
              ) : (
                <span className="badge badge-info text-[10px] py-0.5">MODIFIED</span>
              )}
            </div>
            {dirPath && (
              <span className="text-xs text-kimi-text-muted truncate block">
                {dirPath}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Line count */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-kimi-green">+{addedLines}</span>
            <span className="text-kimi-red">-{removedLines}</span>
          </div>

          {/* Copy path button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyPath();
            }}
            className="p-1.5 rounded hover:bg-kimi-light-gray transition-colors"
            title="Copy file path"
          >
            {copied ? (
              <CheckCircle size={14} className="text-kimi-green" />
            ) : (
              <Copy size={14} className="text-kimi-text-muted" />
            )}
          </button>
        </div>
      </div>

      {/* Diff content */}
      {expanded && (
        <>
          <div className="max-h-[400px] overflow-auto bg-kimi-darker border-t border-kimi-border">
            <div className="diff-container">
              {parsedLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`diff-line ${
                    line.type === 'add'
                      ? 'diff-add'
                      : line.type === 'remove'
                      ? 'diff-remove'
                      : line.type === 'header'
                      ? 'diff-header'
                      : 'diff-context'
                  }`}
                >
                  <span className="diff-line-number">
                    {line.type === 'header'
                      ? ''
                      : line.type === 'add'
                      ? line.newLineNum
                      : line.type === 'remove'
                      ? line.oldLineNum
                      : line.oldLineNum}
                  </span>
                  <span className="diff-line-content">
                    <span className="inline-block w-4 text-center opacity-60">
                      {line.type === 'add' && '+'}
                      {line.type === 'remove' && '-'}
                    </span>
                    {line.content || ' '}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-4 py-3 bg-kimi-gray/30 border-t border-kimi-border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-kimi-red/10 hover:bg-kimi-red/20 text-kimi-red border border-kimi-red/30 rounded-lg transition-all duration-200"
            >
              <X size={16} />
              Reject
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApply();
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-kimi-green/10 hover:bg-kimi-green/20 text-kimi-green border border-kimi-green/30 rounded-lg transition-all duration-200"
            >
              <Check size={16} />
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DiffPane({ diffs, onApply, onReject }: DiffPaneProps) {
  const handleApplyAll = () => {
    diffs.forEach((diff) => onApply(diff.id));
  };

  const handleRejectAll = () => {
    diffs.forEach((diff) => onReject(diff.id));
  };

  // Calculate totals
  const totalAdded = diffs.reduce((acc, diff) => {
    const lines = parseDiff(diff.diff);
    return acc + lines.filter((l) => l.type === 'add').length;
  }, 0);

  const totalRemoved = diffs.reduce((acc, diff) => {
    const lines = parseDiff(diff.diff);
    return acc + lines.filter((l) => l.type === 'remove').length;
  }, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pane-header">
        <div className="flex items-center gap-3">
          <h2>
            <FileCode size={18} className="text-kimi-purple" />
            Code Review
          </h2>
          {diffs.length > 0 && (
            <>
              <span className="badge badge-purple">
                {diffs.length} file{diffs.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 text-xs font-mono text-kimi-text-muted">
                <span className="text-kimi-green">+{totalAdded}</span>
                <span className="text-kimi-red">-{totalRemoved}</span>
              </div>
            </>
          )}
        </div>

        {/* Bulk actions */}
        {diffs.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRejectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-red hover:bg-kimi-red/10 rounded-lg transition-colors"
              title="Reject all changes"
            >
              <XCircle size={14} />
              Reject All
            </button>
            <button
              onClick={handleApplyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-kimi-green hover:bg-kimi-green/10 rounded-lg transition-colors"
              title="Apply all changes"
            >
              <CheckCheck size={14} />
              Apply All
            </button>
          </div>
        )}
      </div>

      {/* Diffs list */}
      <div className="flex-1 overflow-y-auto p-4 scroll-container">
        {diffs.length === 0 ? (
          <div className="empty-state mt-12">
            <div className="w-20 h-20 rounded-2xl bg-kimi-gray flex items-center justify-center mb-6">
              <FileCode size={36} className="text-kimi-text-muted opacity-40" />
            </div>
            <h3 className="empty-state-title">No pending changes</h3>
            <p className="empty-state-description">
              Code changes proposed by the agent will appear here for your review and approval.
            </p>
          </div>
        ) : (
          diffs.map((diff, index) => (
            <DiffViewer
              key={diff.id}
              diff={diff}
              onApply={() => onApply(diff.id)}
              onReject={() => onReject(diff.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
