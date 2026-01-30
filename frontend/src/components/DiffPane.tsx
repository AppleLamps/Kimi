import { useState } from 'react';
import { Check, X, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
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
  const parsedLines = parseDiff(diff.diff);

  const addedLines = parsedLines.filter((l) => l.type === 'add').length;
  const removedLines = parsedLines.filter((l) => l.type === 'remove').length;

  return (
    <div className="border border-kimi-border rounded-lg overflow-hidden mb-3">
      {/* File header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-kimi-gray cursor-pointer hover:bg-kimi-light-gray transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <FileCode size={16} className="text-kimi-blue" />
          <span className="font-mono text-sm">{diff.path}</span>
          <span className="text-xs text-gray-500">
            {diff.original ? '(modified)' : '(new file)'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-kimi-green">+{addedLines}</span>
          <span className="text-xs text-kimi-red">-{removedLines}</span>
        </div>
      </div>

      {/* Diff content */}
      {expanded && (
        <>
          <div className="max-h-96 overflow-auto bg-kimi-darker">
            <div className="diff-container p-2">
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
                      : ''
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
                    {line.type === 'add' && '+ '}
                    {line.type === 'remove' && '- '}
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-kimi-gray border-t border-kimi-border">
            <button
              onClick={onReject}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-kimi-red/20 hover:bg-kimi-red/30 text-kimi-red border border-kimi-red/30 rounded transition-colors"
            >
              <X size={14} />
              Reject
            </button>
            <button
              onClick={onApply}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-kimi-green/20 hover:bg-kimi-green/30 text-kimi-green border border-kimi-green/30 rounded transition-colors"
            >
              <Check size={14} />
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DiffPane({ diffs, onApply, onReject }: DiffPaneProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-kimi-border flex items-center justify-between">
        <h2 className="font-medium">Diff Review</h2>
        {diffs.length > 0 && (
          <span className="text-sm text-gray-400">
            {diffs.length} pending change{diffs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Diffs list */}
      <div className="flex-1 overflow-y-auto p-3">
        {diffs.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <FileCode size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">No pending changes</p>
            <p className="text-sm">
              File changes proposed by the agent will appear here for your
              review.
            </p>
          </div>
        ) : (
          diffs.map((diff) => (
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
