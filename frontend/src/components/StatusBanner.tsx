import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, RefreshCw, WifiOff } from 'lucide-react';

interface StatusBannerProps {
    status: 'connected' | 'disconnected' | 'reconnecting' | 'failed';
    message: string | null;
    attempt?: number;
    gitStatus?: {
        state: 'idle' | 'running' | 'success' | 'error';
        message: string | null;
        action?: 'pull' | 'push';
    };
    onPull?: () => void;
    onPush?: () => void;
}

export default function StatusBanner({ status, message, attempt, gitStatus, onPull, onPush }: StatusBannerProps) {
    if (status === 'connected') {
        return (
            <div className="px-4 py-2 text-sm border-b border-kimi-border flex items-center justify-between bg-kimi-darker/60">
                <div className="flex items-center gap-3">
                    <span className="text-kimi-text-muted">Git</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onPull}
                            disabled={!onPull || gitStatus?.state === 'running'}
                            className="px-2.5 py-1.5 rounded-md border border-kimi-border bg-kimi-gray text-kimi-text-secondary hover:bg-kimi-light-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Pull from remote"
                        >
                            <span className="flex items-center gap-1.5">
                                <ArrowDownToLine size={14} />
                                Pull
                            </span>
                        </button>
                        <button
                            onClick={onPush}
                            disabled={!onPush || gitStatus?.state === 'running'}
                            className="px-2.5 py-1.5 rounded-md border border-kimi-border bg-kimi-gray text-kimi-text-secondary hover:bg-kimi-light-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Push to remote"
                        >
                            <span className="flex items-center gap-1.5">
                                <ArrowUpToLine size={14} />
                                Push
                            </span>
                        </button>
                    </div>
                </div>
                {gitStatus?.message && (
                    <div className={`flex items-center gap-2 text-xs ${gitStatus.state === 'error'
                        ? 'text-kimi-red'
                        : gitStatus.state === 'success'
                            ? 'text-kimi-green'
                            : 'text-kimi-text-secondary'
                        }`}
                    >
                        {gitStatus.state === 'running' && (
                            <RefreshCw size={12} className="animate-spin" />
                        )}
                        <span>{gitStatus.message}</span>
                    </div>
                )}
            </div>
        );
    }

    const baseClasses = 'px-4 py-2 text-sm border-b flex items-center gap-2';

    if (status === 'reconnecting') {
        return (
            <div className={`${baseClasses} bg-kimi-yellow/10 text-kimi-yellow border-kimi-yellow/30`}>
                <RefreshCw size={14} className="animate-spin" />
                <span>{message || `Reconnecting${attempt ? ` (attempt ${attempt})` : ''}...`}</span>
            </div>
        );
    }

    if (status === 'failed') {
        return (
            <div className={`${baseClasses} bg-kimi-red/10 text-kimi-red border-kimi-red/30`}>
                <AlertTriangle size={14} />
                <span>{message || 'Reconnection failed. Please restart the backend.'}</span>
            </div>
        );
    }

    return (
        <div className={`${baseClasses} bg-kimi-red/10 text-kimi-red border-kimi-red/30`}>
            <WifiOff size={14} />
            <span>{message || 'Disconnected from backend.'}</span>
        </div>
    );
}
