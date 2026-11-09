import { expect, test, type Page } from '@playwright/test';

/*
 * Acceptance journey (sandbox): sign up, confirm the review link, approve the sandbox sender,
 * add a customer with consent, send a request, see it delivered, reply STOP, and confirm that
 * no further request reaches that customer.
 */

const PASSWORD = 'correct-horse-battery';

async function signUp(page: Page) {
  const email = `owner-${crypto.randomUUID()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Business name').fill('Harbor Street Kitchen');
  await page.getByLabel('Industry').selectOption('restaurant');
  await page.getByLabel('Time zone').selectOption('America/New_York');
  await page.getByLabel('Postal address').fill('100 Demo Street, Springfield, NY 10001');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up StarNudge' })).toBeVisible();
}

test.describe.serial('acceptance journey', () => {
  test('owner goes from sign-up to a delivered request and a respected STOP', async ({ page }) => {
    await signUp(page);

    // Step 1: review link.
    await page.getByRole('textbox', { name: 'Review link', exact: true }).fill('https://search.google.com/local/writereview?placeid=ChIJE2eTestPlace0001');
    await page.getByRole('button', { name: 'Save review link' }).click();
    await expect(page.getByRole('status')).toContainText('Review link saved');
    await page.getByLabel('I opened the link and the review box appeared.').check();
    await page.getByRole('button', { name: 'Confirm review link' }).click();
    await expect(page.getByRole('status')).toContainText('Review link confirmed');

    // Step 2: sender registration.
    await page.getByLabel('Legal business name').fill('Harbor Street Kitchen LLC');
    await page.getByLabel('Use case').fill('Asking recent diners to share a review of their visit.');
    await page.getByLabel('Sample message').fill('Hi there, thanks for dining with us! Share your experience.');
    await page.getByLabel('How customers gave text consent').fill('Diners sign a paper guest card with a text consent line.');
    await page.getByRole('button', { name: 'Submit sender registration' }).click();
    await expect(page.getByRole('status')).toContainText('submitted');

    // The sandbox owner approves the sender, as a provider would.
    await page.goto('/sandbox');
    await page.getByRole('button', { name: 'Approve sender (sandbox)' }).click();
    await expect(page.getByRole('status')).toContainText('Sandbox sender approved');

    // Add a customer with written text consent.
    await page.goto('/customers');
    await page.getByLabel('First name').fill('Maria');
    await page.getByLabel('Mobile phone').fill('(212) 555-0140');
    await page.getByRole('checkbox', { name: /written permission to receive texts/ }).check();
    await page.getByLabel('Where they gave it').fill('Signed guest card, 2026-11-08');
    await page.getByRole('button', { name: 'Add customer' }).click();
    await expect(page.getByRole('heading', { name: 'Maria' })).toBeVisible();
    const customerUrl = page.url();

    // Send a request now. The same checks as automation run.
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sent by text');

    // The provider accepts it. Mark it delivered in the sandbox.
    await page.goto('/sandbox');
    await expect(page.getByText('review request · sms · accepted')).toBeVisible();
    await page.getByRole('button', { name: 'Mark delivered' }).first().click();
    await expect(page.getByRole('status')).toContainText('Receipt simulated: delivered');

    // Dashboard shows the request as sent.
    await page.goto('/dashboard');
    await expect(page.getByText('Requests sent')).toBeVisible();
    await expect(page.locator('p', { hasText: 'Requests sent' }).locator('xpath=following-sibling::p[1]')).toHaveText('1');

    // Customer replies STOP.
    await page.goto('/sandbox');
    await page.getByRole('button', { name: 'Send reply: “STOP”' }).click();
    await expect(page.getByRole('status')).toContainText('Reply delivered');

    // A later request must not reach her.
    await page.goto(customerUrl);
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('Not sent: opted out');
  });
});

const MOBILE = { width: 360, height: 780 };

test.describe('mobile layout and accessibility', () => {
  test.use({ viewport: MOBILE });

  test('public pages fit a 360px screen with 16px text and no horizontal scroll', async ({ page }) => {
    for (const path of ['/', '/login', '/signup', '/privacy']) {
      await page.goto(path);
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
        fontSize: parseFloat(getComputedStyle(document.body).fontSize),
      }));
      expect(metrics.scroll, `horizontal scroll on ${path}`).toBeLessThanOrEqual(metrics.width);
      expect(metrics.fontSize, `body text on ${path}`).toBeGreaterThanOrEqual(16);
    }
  });

  test('sign-up and log-in pass axe WCAG 2.2 AA checks', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    for (const path of ['/login', '/signup']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(results.violations, `${path}: ${results.violations.map((v) => v.id).join(', ')}`).toEqual([]);
    }
  });

  test('the dashboard fits a 360px screen', async ({ page }) => {
    await signUp(page);
    await page.goto('/dashboard');
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
  });
});
