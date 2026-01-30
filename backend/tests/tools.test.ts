/// <reference types="jest" />
/// <reference types="node" />

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '../src/agent/tools.js';

describe('ToolExecutor', () => {
    let workspaceDir: string;

    beforeEach(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kimi-tools-'));
        await fs.writeFile(path.join(workspaceDir, 'a.txt'), 'hello');
    });

    afterEach(async () => {
        await fs.rm(workspaceDir, { recursive: true, force: true });
    });

    it('lists files in workspace', async () => {
        const tool = new ToolExecutor(workspaceDir);
        const files = await tool.listFiles({});
        expect(files).toContain('a.txt');
    });

    it('rejects paths outside workspace', async () => {
        const tool = new ToolExecutor(workspaceDir);
        await expect(tool.listFiles({ path: '..' })).rejects.toThrow(
            'Path escapes workspace boundary'
        );
    });

    it('applies proposed file changes', async () => {
        const tool = new ToolExecutor(workspaceDir);
        const diff = await tool.proposeFileChange({
            path: 'new.txt',
            new_content: 'new content',
        });

        await tool.applyDiff(diff.id);

        const content = await fs.readFile(path.join(workspaceDir, 'new.txt'), 'utf-8');
        expect(content).toBe('new content');
    });

    it('blocks dangerous commands', async () => {
        const tool = new ToolExecutor(workspaceDir);
        const result = await tool.runCommand({ command: 'rm -rf /' });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('blocked');
    });
});
