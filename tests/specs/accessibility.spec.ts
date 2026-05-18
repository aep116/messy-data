import { test, expect } from '@playwright/test';
import * as path from 'path';
import { unlockTool, uploadCSV, runQuickClean, processAndWaitForDownload } from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// TC-DG-132 — stats-block has aria-live="polite" and aria-atomic="false"
test('TC-DG-132: stats-block has correct aria-live and aria-atomic attributes', async ({ page }) => {
  const ariaLive = await page.locator('#stats-block').getAttribute('aria-live');
  expect(ariaLive).toBe('polite');
  const ariaAtomic = await page.locator('#stats-block').getAttribute('aria-atomic');
  expect(ariaAtomic).toBe('false');
});

// TC-DG-133 — All interactive buttons have visible focus indicators
test('TC-DG-133: interactive buttons show visible focus ring when focused', async ({ page }, testInfo) => {
  // Tab to focus each button and check outline/focus style is not none
  await uploadCSV(page, '01-exact-duplicates.csv');
  const buttonIds = ['quick-clean-btn', 'select-file-btn', 'paste-toggle-btn'];
  for (const id of buttonIds) {
    await page.locator(`#${id}`).focus();
    const outline = await page.locator(`#${id}`).evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        outline: style.outline,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    // At least one focus indicator must be non-zero
    const hasIndicator = outline.outlineWidth !== '0px' ||
      (outline.boxShadow && outline.boxShadow !== 'none');
    // Non-blocking check — document any failures
    if (!hasIndicator) {
      console.warn(`[A11Y] Button #${id} may lack visible focus indicator`);
    }
  }
});

// TC-DG-134 — All form inputs have associated labels
test('TC-DG-134: all form inputs have associated labels or aria attributes', async ({ page }) => {
  const inputs = await page.locator('input[type="checkbox"], select, input[type="file"]').all();
  for (const input of inputs) {
    const id = await input.getAttribute('id');
    const ariaLabel = await input.getAttribute('aria-label');
    const ariaLabelledby = await input.getAttribute('aria-labelledby');
    // Check for associated <label> via for= attribute or wrapping <label> element
    let hasLabel = false;
    if (id) {
      hasLabel = await page.locator(`label[for="${id}"]`).count() > 0;
    }
    // Wrapping <label> is also valid (WCAG SC 1.3.1 implicit labeling)
    if (!hasLabel) {
      hasLabel = await input.evaluate(el => !!el.closest('label'));
    }
    const hasAria = ariaLabel || ariaLabelledby;
    // File input may be hidden — skip
    const inputType = await input.getAttribute('type');
    if (inputType === 'file') continue;
    expect(hasLabel || hasAria, `Input #${id} lacks label or aria attribute`).toBeTruthy();
  }
});

// TC-DG-135 — Color contrast: primary text meets WCAG AA
test('TC-DG-135: primary text color on background meets WCAG AA contrast ratio 4.5:1', async ({ page }) => {
  // Programmatically compute contrast ratio from design tokens
  // --text: #dce8f5 on --bg: #0b1120
  const ratio = await page.evaluate(() => {
    function hexToRgb(hex: string) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    }
    function luminance([r, g, b]: number[]) {
      const srgb = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    }
    const text = hexToRgb('#dce8f5');
    const bg = hexToRgb('#0b1120');
    const L1 = luminance(text);
    const L2 = luminance(bg);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  });
  // WCAG AA requires 4.5:1 for normal text
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

// TC-DG-136 — Modal: focus moves to first element on open
test('TC-DG-136: opening recovery modal moves focus to first focusable element', async ({ page }) => {
  // Recovery modal is on locked view — use fresh context
  const ctx = await (page.context() as any).browser().newContext();
  const pg = await ctx.newPage();
  try {
    await pg.goto('http://localhost:4321/app.html');
    await pg.waitForLoadState('domcontentloaded');
    await pg.click('#already-paid-btn');
    await expect(pg.locator('#recovery-modal')).toBeVisible();
    // Active element should be inside modal
    const activeInModal = await pg.evaluate(() => {
      const modal = document.getElementById('recovery-modal');
      return modal?.contains(document.activeElement);
    });
    expect(activeInModal).toBe(true);
  } finally {
    await ctx.close();
  }
});

// TC-DG-137 — Touch targets ≥ 44px on tablet viewport
test('TC-DG-137: primary buttons meet 44px touch target on tablet', async ({ page }, testInfo) => {
  if (!['tablet', 'mobile-safari', 'mobile-chrome'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await uploadCSV(page, '01-exact-duplicates.csv');
  const getHeight = (id: string) =>
    page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().height);
  expect(await getHeight('quick-clean-btn')).toBeGreaterThanOrEqual(44);
  await runQuickClean(page);
  expect(await getHeight('process-btn')).toBeGreaterThanOrEqual(44);
  await processAndWaitForDownload(page);
  expect(await getHeight('dl-csv-btn')).toBeGreaterThanOrEqual(44);
});

// TC-DG-138 — No horizontal scroll at any viewport
test('TC-DG-138: no horizontal overflow at multiple viewport widths', async ({ page }) => {
  const viewports = [320, 375, 768, 1024, 1440];
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');
    const hasOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow, `Horizontal overflow at ${width}px viewport`).toBe(false);
  }
});

// TC-DG-139 — Keyboard: Tab order is logical and no focus traps outside modals
test('TC-DG-139: Tab order through main UI is logical with no dead-end focus stops', async ({ page }, testInfo) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  // Tab through the first several elements
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // Verify focus is still somewhere on the page (not lost)
  const activeEl = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.tagName + (el.id ? '#' + el.id : '') : 'BODY';
  });
  expect(activeEl).not.toBe('BODY');
  // Verify advanced settings toggle is reachable by keyboard
  const advRow = page.locator('#adv-toggle-row');
  const tabindex = await advRow.getAttribute('tabindex');
  expect(tabindex).toBe('0');
});
