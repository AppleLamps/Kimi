import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    use: {
        baseURL: 'http://localhost:5173',
        headless: true,
    },
    webServer: [
        {
            command: 'npm run dev -w backend',
            port: 3001,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'npm run dev -w frontend',
            port: 5173,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
