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
- `search_files(query, path ?, is_regex ?, case_sensitive ?, include ?, exclude ?, max_results ?, max_bytes_per_file ?)`: Full-text search across workspace files
- `git_operations(action, args ?)`: Git status/diff/commit/branch/checkout/pull/push operations
- `web_search(query, num_results ?)`: Search the web via configured provider
- `create_directory(path, recursive ?)`: Create a new directory (defaults to recursive)
- `delete_file(path)`: Propose deleting a file (requires user approval)
- `move_file(from, to)`: Propose moving/renaming a file (requires user approval)
- `run_tests(scope ?, command ?)`: Run tests (backend/frontend/both/e2e or custom command)

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
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for text across workspace files with optional glob filters and limits.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query text or regex pattern' },
          path: { type: 'string', description: 'Optional base path for the search' },
          is_regex: { type: 'boolean', description: 'Treat query as regex pattern' },
          case_sensitive: { type: 'boolean', description: 'Case-sensitive search' },
          include: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to include' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude' },
          max_results: { type: 'number', description: 'Maximum number of matches to return' },
          max_bytes_per_file: { type: 'number', description: 'Skip files larger than this size (bytes)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'git_operations',
      description: 'Run git status, diff, commit, branch, checkout, pull, or push operations.',
      parameters: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            description: 'Git action to perform (status, diff, commit, branch, checkout, pull, push)',
          },
          args: {
            type: 'object',
            description: 'Optional action arguments (e.g., message, files, branch)',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web via configured provider. Returns results with titles, urls, and snippets when available.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          num_results: { type: 'number', description: 'Number of results to return' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_directory',
      description: 'Create a directory (recursively by default).',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Directory path to create' },
          recursive: { type: 'boolean', description: 'Create parent directories if needed' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: 'Propose deleting a file. Requires user approval before removal.',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path to delete' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'move_file',
      description: 'Propose moving/renaming a file. Requires user approval before rename.',
      parameters: {
        type: 'object' as const,
        properties: {
          from: { type: 'string', description: 'Source file path' },
          to: { type: 'string', description: 'Destination file path' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_tests',
      description: 'Run backend/frontend/e2e tests or a custom command.',
      parameters: {
        type: 'object' as const,
        properties: {
          scope: {
            type: 'string',
            description: 'Test scope: backend, frontend, both, or e2e',
          },
          command: { type: 'string', description: 'Custom command to run tests' },
        },
        required: [],
      },
    },
  },
];
