import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App';

vi.mock('../hooks/useSocket', () => ({
    useSocket: () => ({
        isConnected: false,
        isRunning: false,
        logs: [],
        pendingDiffs: [],
        startTask: vi.fn(),
        stopTask: vi.fn(),
        continueTask: vi.fn(),
        applyDiff: vi.fn(),
        rejectDiff: vi.fn(),
        clearLogs: vi.fn(),
    }),
}));

describe('App', () => {
    it('renders the header title', () => {
        render(<App />);
        expect(screen.getByRole('heading', { name: /Kimi Coding Agent/i })).toBeInTheDocument();
    });
});
