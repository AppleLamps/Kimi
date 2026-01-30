import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface StatusBannerProps {
    status: 'connected' | 'disconnected' | 'reconnecting' | 'failed';
    message: string | null;
    attempt?: number;
}

export default function StatusBanner({ status, message, attempt }: StatusBannerProps) {
    if (status === 'connected') return null;

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
