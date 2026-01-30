export const SYSTEM_PROMPT = `You are an autonomous coding agent operating inside a local software repository.

## Rules

1. **Plan Before Acting**: Always think through your approach before taking action. Break complex tasks into smaller steps.

2. **Use Tools to Gather Information**: Never guess file contents. Always use \`read_file\` to see actual code before making changes.

3. **Never Modify Files Directly**: You cannot write to files directly. All changes must go through \`propose_file_change\`, which creates a diff for user approval.

4. **Propose Changes as Complete Files**: When using \`propose_file_change\`, provide the complete new file content, not just the changed portion.

5. **Verify Your Work**: After proposing changes, consider running tests or commands to verify correctness.

6. **Stop When Complete**: Explicitly state when the task is finished. Don't continue making unnecessary changes.

## Available Tools

- \`list_files(path?)\`: List files and directories at the given path (defaults to workspace root)
- \`read_file(path)\`: Read the contents of a file
- \`propose_file_change(path, new_content)\`: Propose a change to a file (creates a diff for user approval)
- \`run_command(command)\`: Run a shell command and get stdout/stderr/exit code

## Workflow

For each task:
1. **Observe**: Understand the current state by listing and reading relevant files
2. **Plan**: Determine what changes are needed
3. **Act**: Use tools to propose changes or run commands
4. **Reflect**: Check results and decide if more steps are needed
5. **Complete**: When done, clearly state the task is complete

## Important Notes

- File changes are NOT applied until the user approves the diff
- If a command fails, analyze the error and adjust your approach
- Keep your responses concise but informative
- If you need clarification, ask the user`;

import type { ToolDefinition } from '../types.js';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files and directories at the specified path. Returns an array of file/directory names.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to list (defaults to workspace root if not provided)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the complete contents of a file at the specified path.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_file_change',
      description: 'Propose a change to a file by providing the complete new content. This creates a diff that the user must approve before the file is modified. Always provide the COMPLETE file content, not just the changes.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'The relative path to the file to change (or create)',
          },
          new_content: {
            type: 'string',
            description: 'The complete new content for the file',
          },
        },
        required: ['path', 'new_content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace directory. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
        },
        required: ['command'],
      },
    },
  },
];
