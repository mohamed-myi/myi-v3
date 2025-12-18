import { test, expect } from '@playwright/test'

test.describe('Authentication Flows', () => {
    test('authenticated user on landing sees Enter Dashboard button', async ({ page }) => {
        // Mock authenticated user response
        await page.route('**/auth/me', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: '1',
                displayName: 'Test User',
                image: 'https://example.com/user.jpg'
            })
        }))

        await page.goto('/')

        // Should see Enter Dashboard, not Connect Account
        await expect(page.getByRole('button', { name: /Enter Dashboard/i })).toBeVisible()
    })

    test('unauthenticated user on landing sees Connect Account button', async ({ page }) => {
        // Mock 401 unauthenticated response
        await page.route('**/auth/me', route => route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' })
        }))

        await page.goto('/')

        await expect(page.getByRole('button', { name: /Connect Account/i })).toBeVisible()
    })

    test('logout button calls API and redirects to landing', async ({ page }) => {
        // Mock authenticated state for dashboard
        await page.route('**/auth/me', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: '1', displayName: 'Test User' })
        }))

        // Mock stats endpoints (empty is fine)
        await page.route('**/me/stats/**', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        }))

        await page.route('**/me/history**', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ events: [] })
        }))

        // Mock logout endpoint
        await page.route('**/auth/logout', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        }))

        await page.goto('/dashboard')

        // Click logout button
        await page.getByTitle('Logout').click()

        // Should redirect to landing page
        await expect(page).toHaveURL('/')
    })
})
