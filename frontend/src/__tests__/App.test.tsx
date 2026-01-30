import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App';

vi.mock('../hooks/useSocket', () => ({
    useSocket: () => ({
        isConnected: false,
        isRunning: false,
        connectionStatus: 'disconnected',
        reconnectAttempt: 0,
        connectionMessage: null,
        sessionId: null,
        agentState: null,
        logs: [],
        pendingDiffs: [],
        startTask: vi.fn(),
        resumeSession: vi.fn(),
        requestSessionState: vi.fn(),
        loadSessionSnapshot: vi.fn(),
        stopTask: vi.fn(),
        continueTask: vi.fn(),
        applyDiff: vi.fn(),
        rejectDiff: vi.fn(),
        clearLogs: vi.fn(),
    }),
}));

describe('App', () => {
    it('renders the header title', async () => {
        await act(async () => {
            render(<App />);
        });
        expect(screen.getByRole('heading', { name: /Kimi Coding Agent/i })).toBeInTheDocument();
    });
});
