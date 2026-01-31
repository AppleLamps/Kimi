# Kimi Coding Agent

A local-first AI coding GUI powered by Kimi K2.5, featuring a single autonomous agent capable of understanding codebases, planning multi-step changes, and proposing diffs for user approval.

## Features

- **Plan-Act-Observe Loop**: Agent plans before acting, uses tools to gather context, and iterates on results
- **Explicit Tool System**: Four safe tools (`list_files`, `read_file`, `propose_file_change`, `run_command`)
- **Diff-First Safety Model**: All file changes require explicit user approval
- **Smart Context Management**: Automatic context window management with summarization for long tasks
- **Pinned Context**: Keep important files always accessible to the agent
- **Three-Pane Interface**:
  - Task/Chat Pane: Enter tasks, see agent reasoning
  - Diff Review Pane: Review and approve/reject proposed changes
  - Execution Logs: View tool calls and command outputs

## Architecture

```
/backend          - Node.js backend
  /src
    /agent        - Agent loop and tools
    /api          - Moonshot API client
    /workspace    - Workspace utilities
    server.ts     - Express + Socket.IO server

/frontend         - Electron + React frontend
  /src
    /components   - React UI components
    /hooks        - Custom hooks (socket connection)
  /electron       - Electron main process
```

## Prerequisites

- Node.js 18+
- npm or yarn
- Moonshot API key (from https://platform.moonshot.cn/)

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd kimi-coding-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Set up your API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your MOONSHOT_API_KEY
   ```

4. Export your API key:
   ```bash
   export MOONSHOT_API_KEY=your-api-key-here
   ```

## Development

Run both backend and frontend in development mode:

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend (browser mode)
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

For Electron development:
```bash
cd frontend
npm run electron:dev
```

## Usage

1. Select a workspace directory using the folder button in the header
2. Enter a coding task in natural language (e.g., "Add JWT authentication to the FastAPI backend")
3. The agent will:
   - Explore the codebase using `list_files` and `read_file`
   - Plan the changes needed
   - Propose file changes as diffs
4. Review proposed diffs in the center pane
5. Click "Apply" to write changes or "Reject" to skip
6. Pin important files to keep them in context using the "Pin" button in the diff viewer
7. Monitor context usage and pinned files in the Context Usage panel
8. Monitor execution logs in the right pane

### Context Management

The agent automatically manages its context window to ensure optimal performance during long tasks:

- **Automatic Pruning**: When context usage reaches 85% of the limit, older messages are automatically pruned while preserving recent context and system prompts
- **Smart Summarization**: For very long conversations, older messages are summarized to save tokens while retaining key information
- **Pinned Files**: Pin important files to ensure they remain in context even during pruning
- **Usage Visualization**: Monitor current token usage, available tokens, and the impact of pinned files in real-time

You can view context usage by clicking on the "Context Usage" panel in the left sidebar. This shows:
- Current token utilization percentage
- Token counts (current vs. maximum)
- Pinned files and their token usage
- Warnings when context needs pruning

## Tools Available to the Agent

| Tool | Description |
|------|-------------|
| `list_files(path?)` | List files/directories at a path |
| `read_file(path)` | Read file contents |
| `propose_file_change(path, new_content)` | Propose a change (creates diff) |
| `run_command(command)` | Run a shell command |

## Safety Model

- **No direct file writes**: All changes go through `propose_file_change`
- **User approval required**: Files are only modified after explicit approval
- **Sandboxed execution**: Commands run with safety checks
- **Path validation**: Tool paths are validated to stay within workspace
- **Context management**: Automatic context window management prevents token limit errors and maintains conversation quality

## Technology Stack

- **Frontend**: React, Tailwind CSS, Vite, Electron
- **Backend**: Node.js, Express, Socket.IO
- **AI**: Kimi K2.5 via Moonshot API (OpenAI-compatible)
- **Diff**: diff package for unified diff generation

## License

MIT
