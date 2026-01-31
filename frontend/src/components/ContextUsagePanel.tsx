import { useState } from 'react';
import { FileText, Pin, X, TrendingUp, AlertCircle } from 'lucide-react';
import type { PinnedFile, ContextUsage } from '../types';

interface ContextUsagePanelProps {
  pinnedFiles: PinnedFile[];
  contextUsage: ContextUsage | null;
  onPinFile?: (path: string) => void;
  onUnpinFile?: (path: string) => void;
}

export default function ContextUsagePanel({
  pinnedFiles,
  contextUsage,
  onUnpinFile,
}: ContextUsagePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!contextUsage) {
    return null;
  }

  const utilizationColor =
    contextUsage.utilizationPercent >= 85
      ? 'text-red-400'
      : contextUsage.utilizationPercent >= 70
        ? 'text-yellow-400'
        : 'text-green-400';

  const progressBarColor =
    contextUsage.utilizationPercent >= 85
      ? 'bg-red-500'
      : contextUsage.utilizationPercent >= 70
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="border-b border-kimi-border bg-kimi-darker/40">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-kimi-light-gray/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-kimi-text-muted" />
          <span className="text-sm font-medium text-kimi-text">Context Usage</span>
          {contextUsage.needsPruning && (
            <AlertCircle size={14} className="text-yellow-400" title="Context will be pruned soon" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono ${utilizationColor}`}>
            {contextUsage.utilizationPercent.toFixed(1)}%
          </span>
          <span className="text-xs text-kimi-text-muted">
            {contextUsage.currentTokens.toLocaleString()} / {contextUsage.maxTokens.toLocaleString()} tokens
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-2 bg-kimi-gray rounded-full overflow-hidden">
              <div
                className={`h-full ${progressBarColor} transition-all duration-300`}
                style={{ width: `${Math.min(100, contextUsage.utilizationPercent)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-kimi-text-muted">
              <span>Messages: {contextUsage.currentTokens - contextUsage.pinnedTokens} tokens</span>
              <span>Available: {contextUsage.availableTokens.toLocaleString()} tokens</span>
            </div>
          </div>

          {/* Pinned Files */}
          {pinnedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-kimi-text-muted">
                  <Pin size={12} />
                  <span>Pinned Files ({pinnedFiles.length})</span>
                </div>
                <span className="text-[10px] text-kimi-text-muted">
                  {contextUsage.pinnedTokens} tokens
                </span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {pinnedFiles.map((file) => {
                  const fileName = file.path.split('/').pop() || file.path;
                  return (
                    <div
                      key={file.path}
                      className="group flex items-center justify-between gap-2 px-2 py-1.5 bg-kimi-gray/50 rounded hover:bg-kimi-gray transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText size={12} className="text-kimi-blue flex-shrink-0" />
                        <span className="text-xs text-kimi-text truncate" title={file.path}>
                          {fileName}
                        </span>
                      </div>
                      {onUnpinFile && (
                        <button
                          onClick={() => onUnpinFile(file.path)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-kimi-light-gray rounded transition-all"
                          title="Unpin file"
                        >
                          <X size={12} className="text-kimi-text-muted hover:text-kimi-text" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {contextUsage.needsPruning && (
            <div className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-200">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Context usage is high. Older messages will be automatically summarized to maintain performance.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
