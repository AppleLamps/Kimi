export { };

declare global {
    interface ImportMetaEnv {
        readonly VITE_BACKEND_URL?: string;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }

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
            library?: {
                get: () => Promise<unknown>;
                save: (library: unknown) => Promise<void>;
            };
        };
    }
}
