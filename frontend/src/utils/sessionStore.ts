import type { SessionRecord } from '../types';

type SessionStore = {
    list: () => Promise<SessionRecord[]>;
    upsert: (record: SessionRecord) => Promise<void>;
    remove: (sessionId: string) => Promise<void>;
    export: (record: SessionRecord) => Promise<string | null>;
    import: () => Promise<SessionRecord | null>;
};

const STORAGE_KEY = 'kimi.sessions';

function getBrowserStore(): SessionStore {
    const readAll = (): SessionRecord[] => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            return JSON.parse(raw) as SessionRecord[];
        } catch {
            return [];
        }
    };

    const writeAll = (sessions: SessionRecord[]) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    };

    return {
        list: async () => readAll(),
        upsert: async (record) => {
            const sessions = readAll();
            const index = sessions.findIndex((s) => s.id === record.id);
            if (index >= 0) {
                sessions[index] = record;
            } else {
                sessions.unshift(record);
            }
            writeAll(sessions);
        },
        remove: async (sessionId) => {
            const sessions = readAll().filter((s) => s.id !== sessionId);
            writeAll(sessions);
        },
        export: async (_record) => null,
        import: async () => null,
    };
}

export function getSessionStore(): SessionStore {
    if (window.electronAPI?.sessions) {
        return window.electronAPI.sessions;
    }

    return getBrowserStore();
}
