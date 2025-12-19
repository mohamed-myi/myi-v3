
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
    test('should display critical elements on load', async ({ page }) => {
        await page.goto('/');

        // Check for the main heading
        await expect(page.getByRole('heading', { name: "Who's listening?" })).toBeVisible();

        await expect(page.getByRole('button')).toBeVisible();
    });

    test('should verify login redirect URL', async ({ page }) => {
        await page.goto('/');
        const loginButton = page.getByRole('button', { name: /Login with Spotify|Enter Dashboard/i });

        await expect(loginButton).toHaveText('Login with Spotify');
    });
});
