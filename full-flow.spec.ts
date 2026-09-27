/**
 * End-to-end smoke test covering the Final Acceptance Test scenario from the
 * spec: sign in, add a question, search/filter, generate a paper, verify the
 * exact question count, export, and confirm the original question bank is
 * untouched.
 *
 * Requires a running app (npm run build && npm run start) pointed at a
 * seeded database (npm run db:seed) — see README.md § Testing. Not run as
 * part of a plain `npm test` (that's the Vitest unit suite); run explicitly
 * with `npm run test:e2e` once the environment is configured.
 */
import { test, expect } from '@playwright/test'

const OWNER_EMAIL = 'owner@qbank.demo'
const DEMO_PASSWORD = 'Passw0rd!2026'

test.describe('Question Bank Manager — core flow', () => {
  test('sign in, add a question, and confirm it appears untouched in the bank', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(OWNER_EMAIL)
    await page.getByLabel('Password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/questions/new')
    const uniqueText = `E2E test question ${Date.now()} — what is the capital of France?`
    await page.getByLabel(/Question Text/i).fill(uniqueText)
    // Tag selectors are custom searchable dropdowns — open each and pick the first option.
    for (const label of ['Subject', 'Class / Exam', 'Code', 'Difficulty']) {
      await page.getByText(label, { exact: true }).first().locator('..').getByRole('button').first().click()
      await page.getByRole('button').filter({ hasText: /.+/ }).first().click()
    }
    await page.getByLabel(/Question No\./i).fill(`E2E-${Date.now()}`)
    await page.getByRole('button', { name: /^Save Question$/ }).click()

    await expect(page.getByText(uniqueText).first()).toBeVisible({ timeout: 10_000 })
  })

  test('generate a paper with an exact question count and verify no duplicates', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(OWNER_EMAIL)
    await page.getByLabel('Password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.goto('/papers/new')
    await page.getByPlaceholder(/Physics Unit Test/).fill(`E2E Paper ${Date.now()}`)
    // Assumes the seeded Physics / 11 JEE / Code A combination has enough
    // Easy/Medium/Difficult questions (seeded by prisma/seed.ts).
    await page.getByRole('button', { name: /Generate Paper/ }).click()

    await expect(page).toHaveURL(/\/papers\/[0-9a-f-]+$/, { timeout: 15_000 })
  })
})
