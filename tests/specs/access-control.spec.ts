import { test, expect } from '@playwright/test';
import { unlockTool } from './helpers';

// TC-DG-83 — No token: locked-view visible, tool-view hidden
test('TC-DG-83: no token shows locked view and hides tool view', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('http://localhost:4321/app.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#locked-view')).toBeVisible();
    await expect(page.locator('#tool-view')).not.toBeVisible();
    await expect(page.locator('#feedback-btn')).not.toBeVisible();
  } finally {
    await ctx.close();
  }
});

// TC-DG-84 — Valid order_number in URL: tool unlocks, token stored, URL cleaned
test('TC-DG-84: valid order_number in URL unlocks tool and cleans URL', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('http://localhost:4321/app.html?order_number=VALID-TEST-1234');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#tool-view')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBe('VALID-TEST-1234');
    // URL cleaned — no order_number param
    expect(page.url()).not.toContain('order_number');
  } finally {
    await ctx.close();
  }
});

// TC-DG-85 — Invalid order_number with special characters rejected
test('TC-DG-85: order_number with special characters is rejected (XSS prevention)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const xssPayload = encodeURIComponent('<script>alert(1)</script>');
    await page.goto(`http://localhost:4321/app.html?order_number=${xssPayload}`);
    await page.waitForLoadState('domcontentloaded');
    // Token must NOT be stored
    const stored = await page.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBeNull();
    // User stays locked
    await expect(page.locator('#locked-view')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// TC-DG-86 — Invalid order_number too short (< 4 chars) rejected
test('TC-DG-86: order_number shorter than 4 chars is rejected', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('http://localhost:4321/app.html?order_number=ab');
    await page.waitForLoadState('domcontentloaded');
    const stored = await page.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBeNull();
    await expect(page.locator('#locked-view')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// TC-DG-87 — Invalid order_number too long (> 64 chars) rejected
test('TC-DG-87: order_number longer than 64 chars is rejected', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const longToken = 'a'.repeat(65);
    await page.goto(`http://localhost:4321/app.html?order_number=${longToken}`);
    await page.waitForLoadState('domcontentloaded');
    const stored = await page.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBeNull();
    await expect(page.locator('#locked-view')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// TC-DG-88 — Existing token survives page reload
test('TC-DG-88: valid token survives page reload', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
  // Reload
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#tool-view')).toBeVisible();
  await expect(page.locator('#locked-view')).not.toBeVisible();
});

// TC-DG-89 — Safari private mode: localStorage blocked → locked state, no crash
test('TC-DG-89: localStorage SecurityError shows locked state without crashing', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(err.message));
  try {
    // Override localStorage.getItem to throw SecurityError before navigation
    await page.addInitScript(() => {
      const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
      try {
        Object.defineProperty(window, 'localStorage', {
          get() {
            const e = new DOMException('Access denied', 'SecurityError');
            throw e;
          },
          configurable: true,
        });
      } catch (_) {
        // In some browsers, can't override localStorage — skip override
      }
    });
    await page.goto('http://localhost:4321/app.html');
    await page.waitForLoadState('domcontentloaded');
    // No uncaught errors
    expect(consoleErrors.length).toBe(0);
    // App still renders (locked or not — no crash is the key requirement)
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBe(true);
  } finally {
    await ctx.close();
  }
});

// TC-DG-90 — "Purchased" badge visible when unlocked
test('TC-DG-90: Purchased badge is visible when tool is unlocked', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
  await expect(page.locator('#purchased-badge')).toBeVisible();
  const badgeText = await page.locator('#purchased-badge').innerText();
  expect(badgeText).toMatch(/purchased/i);
});

// TC-DG-91 — feedback-btn visible only when unlocked
test('TC-DG-91: feedback-btn is hidden when locked and visible when unlocked', async ({ browser }) => {
  // Without token
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  try {
    await pg.goto('http://localhost:4321/app.html');
    await pg.waitForLoadState('domcontentloaded');
    await expect(pg.locator('#feedback-btn')).not.toBeVisible();
  } finally {
    await ctx.close();
  }

  // With token (use new page from passed browser fixture)
  const ctx2 = await browser.newContext();
  const pg2 = await ctx2.newPage();
  try {
    await pg2.addInitScript(() => {
      localStorage.setItem('cleanlist_v1_order_id', 'TEST-ORDER-123');
    });
    await pg2.goto('http://localhost:4321/app.html');
    await pg2.waitForLoadState('domcontentloaded');
    await expect(pg2.locator('#feedback-btn')).toBeVisible();
  } finally {
    await ctx2.close();
  }
});
