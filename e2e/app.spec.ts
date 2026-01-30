import { test, expect } from '@playwright/test';

test('loads the app and shows connection status', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('header h1')).toContainText('Kimi');
    await expect(page.getByText(/Connected|Disconnected/)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept('C:/tmp'));
    await page.getByRole('button', { name: /Workspace/i }).click();

    await expect(page.getByText('tmp')).toBeVisible();

    const input = page.getByPlaceholder('Describe your coding task...');
    await expect(input).toBeEnabled();
});
