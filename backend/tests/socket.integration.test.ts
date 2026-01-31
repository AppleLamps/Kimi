/// <reference types="jest" />
/// <reference types="node" />

import { io as socketClient, Socket } from 'socket.io-client';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { AgentUpdate, ModelConfig } from '../src/types.js';
import { createBackendServer } from '../src/server.js';

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => {
        socket.once(event, (data: T) => resolve(data));
    });
}

class FakeAgentLoop {
    private state = {
        taskId: `test-${Date.now()}`,
        task: 'test',
        messages: [],
        pendingDiffs: new Map(),
        isRunning: false,
        isComplete: false,
        workspacePath: '',
    };

    constructor(
        _apiKey: string,
        workspacePath: string,
        _task: string,
        private onUpdate: (update: AgentUpdate) => void,
        private modelConfig?: ModelConfig
    ) {
        this.state.workspacePath = workspacePath;
    }

    getState() {
        return this.state;
    }

    async start() {
        this.state.isRunning = true;
        this.onUpdate({ type: 'message', data: { content: 'started' } });
        this.state.isRunning = false;
    }

    stop() {
        this.state.isRunning = false;
    }

    addUserMessage(_content: string) { }

    async applyDiff(_diffId: string) {
        return null;
    }

    rejectDiff(_diffId: string) {
        return null;
    }

    async applyAllDiffs() {
        return [];
    }

    rejectAllDiffs() {
        return [];
    }

    getPendingDiffs() {
        return [];
    }

    getSerializableState() {
        return {
            taskId: this.state.taskId,
            task: this.state.task,
            messages: [],
            pendingDiffs: [],
            isRunning: this.state.isRunning,
            isComplete: this.state.isComplete,
            workspacePath: this.state.workspacePath,
            modelConfig: this.modelConfig || {
                model: 'kimi-k2-0711-preview',
                temperature: 0.3,
                maxTokens: 100000,
            },
        };
    }
}

describe('Socket.IO integration', () => {
    let workspaceDir: string;

    beforeAll(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kimi-socket-'));
    });

    afterAll(async () => {
        await fs.rm(workspaceDir, { recursive: true, force: true });
    });

    it('emits error when API key is missing', async () => {
        const server = createBackendServer({ apiKey: '' });
        const { port } = await server.start(0);

        const socket = socketClient(`http://localhost:${port}`);
        await waitForEvent(socket, 'connect');

        socket.emit('task:start', { task: 'test', workspacePath: workspaceDir });
        const update = await waitForEvent<AgentUpdate>(socket, 'agent:update');

        expect(update.type).toBe('error');
        expect((update.data as { message: string }).message).toContain('MOONSHOT_API_KEY');

        socket.disconnect();
        await server.stop();
    });

    it('emits error for invalid workspace path', async () => {
        const server = createBackendServer({ apiKey: 'test-key' });
        const { port } = await server.start(0);

        const socket = socketClient(`http://localhost:${port}`);
        await waitForEvent(socket, 'connect');

        socket.emit('task:start', { task: 'test', workspacePath: 'Z:/path/does-not-exist' });
        const update = await waitForEvent<AgentUpdate>(socket, 'agent:update');

        expect(update.type).toBe('error');
        expect((update.data as { message: string }).message).toContain('Invalid workspace path');

        socket.disconnect();
        await server.stop();
    });

    it('starts a session when inputs are valid', async () => {
        const server = createBackendServer({
            apiKey: 'test-key',
            agentLoopFactory: (apiKey, workspacePath, task, onUpdate, modelConfig) =>
                new FakeAgentLoop(apiKey, workspacePath, task, onUpdate, modelConfig) as never,
        });
        const { port } = await server.start(0);

        const socket = socketClient(`http://localhost:${port}`);
        await waitForEvent(socket, 'connect');

        socket.emit('task:start', { task: 'test', workspacePath: workspaceDir });
        const started = await waitForEvent<{ sessionId: string }>(socket, 'session:started');

        expect(started.sessionId).toBeTruthy();

        socket.disconnect();
        await server.stop();
    });

    it('returns error when applying diff without session', async () => {
        const server = createBackendServer({ apiKey: 'test-key' });
        const { port } = await server.start(0);

        const socket = socketClient(`http://localhost:${port}`);
        await waitForEvent(socket, 'connect');

        socket.emit('diff:apply', { diffId: 'missing' });
        const update = await waitForEvent<AgentUpdate>(socket, 'agent:update');

        expect(update.type).toBe('error');
        expect((update.data as { message: string }).message).toContain('No active session');

        socket.disconnect();
        await server.stop();
    });
});
