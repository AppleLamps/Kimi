/// <reference types="jest" />
/// <reference types="node" />

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { AgentUpdate, ToolCall } from '../src/types.js';
import { AgentLoop } from '../src/agent/agentLoop.js';
import { MoonshotClient } from '../src/api/moonshotClient.js';

describe('AgentLoop', () => {
    let workspaceDir: string;

    beforeEach(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kimi-agent-'));
        await fs.writeFile(path.join(workspaceDir, 'file.txt'), 'hello');
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.rm(workspaceDir, { recursive: true, force: true });
    });

    it('marks complete when model signals completion', async () => {
        const chatSpy = jest.spyOn(MoonshotClient.prototype, 'chat');
        chatSpy.mockResolvedValueOnce({
            content: 'Task complete',
            toolCalls: null,
            finishReason: 'stop',
        });

        const updates: AgentUpdate[] = [];
        const agent = new AgentLoop('test-key', workspaceDir, 'do something', (u) => updates.push(u));

        await agent.start();

        expect(agent.getState().isComplete).toBe(true);
        expect(updates.some((u) => u.type === 'complete')).toBe(true);
    });

    it('executes tool calls and continues the loop', async () => {
        const toolCall: ToolCall = {
            id: 'call-1',
            type: 'function',
            function: {
                name: 'list_files',
                arguments: '{}',
            },
        };

        const chatSpy = jest.spyOn(MoonshotClient.prototype, 'chat');
        chatSpy
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [toolCall],
                finishReason: 'tool_calls',
            })
            .mockResolvedValueOnce({
                content: 'Task complete',
                toolCalls: null,
                finishReason: 'stop',
            });

        const updates: AgentUpdate[] = [];
        const agent = new AgentLoop('test-key', workspaceDir, 'list files', (u) => updates.push(u));

        await agent.start();

        expect(updates.some((u) => u.type === 'tool_call')).toBe(true);
        expect(updates.some((u) => u.type === 'tool_result')).toBe(true);
        expect(agent.getState().isComplete).toBe(true);
    });
});
