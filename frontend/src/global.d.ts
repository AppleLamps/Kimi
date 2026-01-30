export { };

declare global {
    interface Window {
        electronAPI?: {
            selectDirectory?: () => Promise<string | null>;
            getHomeDirectory?: () => Promise<string>;
            sessions?: {
                list: () => Promise<unknown[]>;
                upsert: (record: unknown) => Promise<void>;
                remove: (sessionId: string) => Promise<void>;
                export: (record: unknown) => Promise<string | null>;
                import: () => Promise<unknown | null>;
            };
        };
    }
}
