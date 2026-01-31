import { useMemo, useState, useEffect } from 'react';
import { Clock, FileDown, FileUp, History, Play, Search } from 'lucide-react';
import type { SessionRecord } from '../types';

const SESSION_PAGE_SIZE = 8;

interface SessionHistoryProps {
    sessions: SessionRecord[];
    searchValue: string;
    onSearchChange: (value: string) => void;
    onResume: (record: SessionRecord) => void;
    onExport: (record: SessionRecord) => void;
    onImport: () => void;
}

export default function SessionHistory({
    sessions,
    searchValue,
    onSearchChange,
    onResume,
    onExport,
    onImport,
}: SessionHistoryProps) {
    const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);
    const filtered = useMemo(() => {
        const query = searchValue.trim().toLowerCase();
        if (!query) return sessions;
        return sessions.filter((session) => {
            return (
                session.title.toLowerCase().includes(query) ||
                session.workspacePath.toLowerCase().includes(query)
            );
        });
    }, [sessions, searchValue]);

    useEffect(() => {
        setVisibleCount(SESSION_PAGE_SIZE);
    }, [searchValue, sessions.length]);

    const pagedSessions = filtered.slice(0, visibleCount);
    const remainingCount = Math.max(0, filtered.length - pagedSessions.length);

    return (
        <div className="border-b border-kimi-border bg-kimi-darker/60">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History size={16} className="text-kimi-purple" />
                    <h3 className="text-sm font-semibold">Sessions</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onImport}
                        className="btn-ghost p-1.5 rounded-md"
                        title="Import session"
                    >
                        <FileUp size={14} />
                    </button>
                </div>
            </div>

            <div className="px-4 pb-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-kimi-text-muted" />
                    <input
                        value={searchValue}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search sessions..."
                        className="w-full bg-kimi-gray border border-kimi-border rounded-lg pl-9 pr-3 py-2 text-xs text-kimi-text-secondary focus:outline-none focus:border-kimi-border-light"
                    />
                </div>
            </div>

            <div className="max-h-[220px] overflow-y-auto px-2 pb-3">
                {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-kimi-text-muted">No sessions found.</p>
                ) : (
                    <>
                        {pagedSessions.map((session) => (
                            <div
                                key={session.id}
                                className="mb-2 px-3 py-2 rounded-lg border border-kimi-border/60 bg-kimi-gray/40"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-kimi-text truncate">{session.title}</p>
                                        <p className="text-[10px] text-kimi-text-muted truncate">{session.workspacePath}</p>
                                    </div>
                                    <button
                                        onClick={() => onResume(session)}
                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-kimi-purple/20 text-kimi-purple border border-kimi-purple/30"
                                        title="Resume session"
                                    >
                                        <Play size={10} />
                                        Resume
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[10px] text-kimi-text-muted flex items-center gap-1">
                                        <Clock size={10} />
                                        {new Date(session.updatedAt).toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => onExport(session)}
                                        className="text-[10px] text-kimi-text-muted hover:text-kimi-text flex items-center gap-1"
                                        title="Export session"
                                    >
                                        <FileDown size={10} />
                                        Export
                                    </button>
                                </div>
                            </div>
                        ))}
                        {remainingCount > 0 && (
                            <div className="flex justify-center">
                                <button
                                    onClick={() => setVisibleCount((prev) => prev + SESSION_PAGE_SIZE)}
                                    className="btn-ghost px-3 py-1 text-[10px] rounded-full"
                                    title="Load more sessions"
                                >
                                    Load {Math.min(SESSION_PAGE_SIZE, remainingCount)} more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
