import { LibraryData, CodeSnippet } from '../types';

const INITIAL_LIBRARY: LibraryData = {
    presets: [
        {
            id: 'refactor',
            label: 'Refactor Code',
            task: 'Refactor the following code to be more readable and efficient. Focus on DRY principles and modern design patterns.',
            icon: 'zap',
            systemPromptOverride: 'You are an expert refactoring assistant. Focus on clean code, SOLID principles, and minimizing side effects.'
        },
        {
            id: 'add-tests',
            label: 'Add Unit Tests',
            task: 'Add comprehensive unit tests for this file using the existing test framework.',
            icon: 'check-square',
            systemPromptOverride: 'You are a QA expert. Focus on edge cases, boundary conditions, and high path coverage.'
        },
        {
            id: 'document',
            label: 'Document Code',
            task: 'Add JSDoc/TSDoc comments and inline documentation to explain the logic and usage of this code.',
            icon: 'file-text'
        },
        {
            id: 'add-types',
            label: 'Add TypeScript Types',
            task: 'Add explicit TypeScript types and interfaces to this code. Avoid using "any" and prefer strong typing.',
            icon: 'zap',
            systemPromptOverride: 'You are a TypeScript expert. Focus on type safety, narrow types, and avoiding type assertions.'
        }
    ],
    templates: [
        {
            id: 'vite-react-tailwind',
            name: 'Vite + React + Tailwind',
            description: 'Scaffold a modern React application with Vite and Tailwind CSS.',
            task: 'Create a new Vite + React project with Tailwind CSS configured. Include basic project structure, ESLint, and a sample component.',
            icon: 'layout'
        },
        {
            id: 'express-ts-api',
            name: 'Express + TS API',
            description: 'Scaffold a robust Express API with TypeScript, Winston logging, and Zod validation.',
            task: 'Initialize a new Express.js project with TypeScript. Set up a standard project structure with routes, controllers, and middleware. Include Winston for logging and Zod for input validation.',
            icon: 'layout'
        }
    ],
    snippets: []
};

const LOCAL_STORAGE_KEY = 'kimi.library';

const readLibraryFromLocalStorage = (): LibraryData | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LibraryData;
    } catch {
        return null;
    }
};

const normalizeLibraryData = (value: unknown): LibraryData => {
    if (!value || typeof value !== 'object') {
        return { presets: [], templates: [], snippets: [] };
    }
    const data = value as Partial<LibraryData>;
    return {
        presets: Array.isArray(data.presets) ? data.presets : [],
        templates: Array.isArray(data.templates) ? data.templates : [],
        snippets: Array.isArray(data.snippets) ? data.snippets : [],
    };
};

const writeLibraryToLocalStorage = (library: LibraryData): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(library));
};

class LibraryStore {
    private data: LibraryData | null = null;

    async getLibrary(): Promise<LibraryData> {
        if (this.data) return this.data;

        try {
            const saved = window.electronAPI?.library
                ? await window.electronAPI.library.get()
                : readLibraryFromLocalStorage() ?? { presets: [], templates: [], snippets: [] };
            const normalized = normalizeLibraryData(saved);
            // Merge saved data with initial data to ensure defaults exist
            this.data = {
                presets: this.mergeItems(INITIAL_LIBRARY.presets, normalized.presets || []),
                templates: this.mergeItems(INITIAL_LIBRARY.templates, normalized.templates || []),
                snippets: normalized.snippets || []
            };
        } catch (error) {
            console.error('Failed to load library:', error);
            this.data = { ...INITIAL_LIBRARY };
        }

        return this.data!;
    }

    private mergeItems<T extends { id: string }>(defaults: T[], saved: T[]): T[] {
        const merged = [...defaults];
        saved.forEach(savedItem => {
            const index = merged.findIndex(i => i.id === savedItem.id);
            if (index >= 0) {
                merged[index] = savedItem;
            } else {
                merged.push(savedItem);
            }
        });
        return merged;
    }

    async saveLibrary(data: LibraryData): Promise<void> {
        this.data = data;
        if (window.electronAPI?.library) {
            await window.electronAPI.library.save(data);
        } else {
            writeLibraryToLocalStorage(data);
        }
    }

    async addSnippet(snippet: Omit<CodeSnippet, 'id' | 'createdAt'>): Promise<CodeSnippet> {
        const library = await this.getLibrary();
        const newSnippet: CodeSnippet = {
            ...snippet,
            id: Math.random().toString(36).substring(7),
            createdAt: new Date().toISOString()
        };
        library.snippets.unshift(newSnippet);
        await this.saveLibrary(library);
        return newSnippet;
    }

    async removeSnippet(id: string): Promise<void> {
        const library = await this.getLibrary();
        library.snippets = library.snippets.filter(s => s.id !== id);
        await this.saveLibrary(library);
    }
}

export const libraryStore = new LibraryStore();
