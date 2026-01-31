# Kimi Coding Agent - Next Steps

This document outlines potential features, improvements, and enhancements for the Kimi Coding Agent project.

---

## High Priority

### 1. Testing Infrastructure

**Impact:** Critical for reliability and maintainability

- [x] Set up testing framework (Vitest for frontend, Jest for backend)
- [x] Add unit tests for agent loop (`backend/src/agent/agentLoop.ts`)
- [x] Add unit tests for tool implementations (`backend/src/agent/tools.ts`)
- [x] Add integration tests for Socket.IO communication
- [x] Add E2E tests using Playwright or Cypress for UI workflows
- [x] Configure CI/CD pipeline for automated testing

### 2. Error Recovery & Resilience

**Impact:** Improves user experience and agent reliability

- [x] Implement graceful error handling in agent loop
- [x] Add retry mechanism for transient API failures
- [x] Allow agent to recover from tool execution errors
- [x] Provide clear, actionable error messages to users
- [x] Add connection recovery for WebSocket disconnections
- [x] Implement automatic reconnection with exponential backoff

### 3. Session Persistence

**Impact:** Enables resuming work and improves productivity

- [x] Persist sessions to localStorage/IndexedDB
- [x] Allow resuming previous sessions
- [x] Implement task history with search
- [x] Add session export/import functionality
- [x] Store workspace associations with sessions

### 4. Model Configuration

**Impact:** Flexibility for users with different needs

- [x] Add UI for model selection (kimi-k2-0711-preview and other Moonshot models)
- [x] Implement temperature and max_tokens configuration
- [x] Add support for custom API endpoints (other OpenAI-compatible providers)
- [x] Store user preferences persistently

---

## Medium Priority

### 5. UI/UX Enhancements

#### Logs Pane Improvements

- [x] Add search/filter functionality for logs
- [x] Implement log level filtering (errors, tool calls, thinking)
- [x] Add export logs feature (JSON, text formats)
- [x] Collapse/expand all tool results button

#### Code Review Pane Improvements

- [x] Add syntax highlighting based on file type
- [x] Implement side-by-side diff view option
- [x] Add "Apply All" / "Reject All" batch actions
- [x] Show file tree of pending changes
- [x] Add inline commenting on diffs

#### Task Pane Improvements

- [x] Add message timestamps
- [x] Implement message editing/regeneration
- [x] Add code block syntax highlighting in chat
- [x] Quick actions for common tasks (e.g., "Fix this error", "Add tests")

#### General UI

- [x] Add keyboard shortcuts (Cmd/Ctrl+Enter to send, Escape to stop)
- [x] Implement light/dark theme toggle
- [x] Add workspace quick-switch dropdown
- [x] Show token usage per message
- [x] Add progress indicator for long operations

### 6. Additional Tools for Agent

- [x] `search_files` - Full-text search across workspace
- [x] `git_operations` - Git status, diff, commit, branch operations
- [x] `web_search` - Search documentation and Stack Overflow
- [x] `create_directory` - Create new directories
- [x] `delete_file` - Delete files (with approval)
- [x] `move_file` - Rename/move files
- [x] `run_tests` - Execute test suites with parsed results

### 7. Git Integration

- [ ] Display git status in UI
- [ ] Show uncommitted changes indicator
- [ ] Auto-stage applied diffs
- [ ] Commit dialog with AI-generated messages
- [ ] Branch creation and switching
- [x] Pull/push operations
- [ ] Diff against branches

### 8. Performance Optimizations

- [x] Implement message pagination for long conversations
- [x] Cache workspace file structure
- [x] Add streaming for API responses
- [x] Lazy load file contents in diff viewer
- [x] Debounce rapid UI updates
- [x] Virtualize long lists (logs, diffs)

---

## Lower Priority

### 9. Documentation

- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Write comprehensive development setup guide
- [ ] Add troubleshooting guide
- [ ] Document tool specifications
- [ ] Create architecture deep-dive document
- [ ] Add inline JSDoc comments for exported functions
- [ ] Create user guide with examples

### 10. Code Quality Improvements

- [ ] Extract magic numbers to configuration constants
- [ ] Add structured logging framework (winston, pino)
- [ ] Implement proper input validation with Zod
- [ ] Add request/response logging middleware
- [ ] Improve command blocking patterns for security
- [ ] Add ESLint rules for consistency
- [ ] Set up Prettier for formatting

### 11. Advanced Features

#### Multi-file Operations

- [ ] Batch propose changes across multiple files
- [ ] Atomic transactions (apply all or none)
- [ ] Preview full impact before applying

#### Context Management

- [ ] Smart context window management
- [ ] Automatic context summarization for long tasks
- [ ] Pinned context (files always in context)
- [ ] Context usage visualization

#### Templates & Presets

- [ ] Project templates (React, Express, etc.)
- [ ] Task presets ("Add tests", "Refactor", "Document")
- [ ] Custom system prompt overrides
- [ ] Saved code snippets

#### Collaboration

- [ ] Multi-workspace support
- [ ] Remote backend deployment option
- [ ] Session sharing (export/import)
- [ ] Team knowledge base integration

### 12. Observability & Analytics

- [ ] API call logging with duration tracking
- [ ] Token usage analytics dashboard
- [ ] Error tracking integration (Sentry)
- [ ] Performance metrics collection
- [ ] User behavior analytics (opt-in)

### 13. Plugin System

- [ ] Define plugin API for custom tools
- [ ] Support custom UI components
- [ ] Enable community-contributed tools
- [ ] Plugin marketplace/registry

---

## Security Enhancements

- [ ] Implement rate limiting on API calls
- [ ] Add request validation middleware
- [ ] Improve command blocking patterns
- [ ] Add audit logging for all file operations
- [ ] Implement workspace access controls
- [ ] Add option to require confirmation for all commands

---

## Build & Distribution

- [ ] Set up auto-update mechanism
- [ ] Code signing for macOS/Windows
- [ ] Create installer customization
- [ ] Add crash reporting
- [ ] Implement telemetry (opt-in)
- [ ] Create portable version (no install required)

---

## Technical Debt

- [ ] Remove hardcoded model string in `moonshotClient.ts:28`
- [ ] Extract iteration limit (50) to configuration
- [ ] Extract command timeout (60s) to configuration
- [ ] Extract max output buffer (1MB) to configuration
- [ ] Centralize error messages
- [ ] Add proper TypeScript strict mode
- [ ] Update dependencies to latest versions

---

## Quick Wins (Can implement immediately)

1. **Add keyboard shortcuts** - Improve UX with minimal effort
2. **Show token usage** - Add to message metadata display
3. **Log filtering** - Simple filter input for logs pane
4. **Apply All button** - Batch action for diffs
5. **Message timestamps** - Add to chat messages
6. **Copy button for code blocks** - Already have infrastructure
7. **Configuration constants** - Extract magic numbers

---

## Suggested Implementation Order

1. **Testing infrastructure** - Foundation for safe changes
2. **Error recovery** - Critical for user experience
3. **Session persistence** - High-value feature
4. **Git integration** - Natural workflow enhancement
5. **UI quick wins** - Immediate UX improvements
6. **Model configuration** - User flexibility
7. **Additional tools** - Expand agent capabilities
8. **Documentation** - Support adoption

---

*Last updated: January 2026*
