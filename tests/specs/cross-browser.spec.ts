import { test, expect } from '@playwright/test';
import * as path from 'path';
import { unlockTool, uploadCSV, runQuickClean, processAndWaitForDownload, downloadCSV, parseCSV } from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// ── TC33: Preview table DOM ───────────────────────────────────────
test('TC33: preview table renders correct headers and row count', async ({ page }) => {
  // 01-exact-duplicates: 6 rows → 4 after 2 dupes removed; emails already lowercase
  // so changedCols is empty → all columns shown by default
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);

  await expect(page.locator('#preview-table')).toBeVisible();

  // Preview defaults to "changed columns" only. Show all so company column is visible.
  await page.click('#show-all-btn');

  // All four columns present in thead
  const headers = await page.locator('#preview-table thead th').allInnerTexts();
  expect(headers).toContain('first_name');
  expect(headers).toContain('last_name');
  expect(headers).toContain('email');
  expect(headers).toContain('company');

  // Exactly 4 data rows in tbody
  const rowCount = await page.locator('#preview-table tbody tr').count();
  expect(rowCount).toBe(4);

  // First row is John Smith (order preserved, dupes removed)
  const firstRowCells = await page.locator('#preview-table tbody tr:first-child td').allInnerTexts();
  expect(firstRowCells[0]).toBe('John');
  expect(firstRowCells[1]).toBe('Smith');
});

// ── TC34: Keyboard navigation ─────────────────────────────────────
test('TC34: full clean flow is completable via keyboard', async ({ page }) => {
  // Load file programmatically so keyboard test starts at quick-clean stage
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  // Quick Clean button: focusable and activatable with Enter
  await page.focus('#quick-clean-btn');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('quick-clean-btn');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  // Process button: focusable and activatable with Enter
  await page.focus('#process-btn');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('process-btn');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#download-section', { state: 'visible' });

  // Download CSV button — detect iOS before clicking (href is set only after the click)
  const isIOS = await page.evaluate(() =>
    /iP(ad|hone|od)/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|OPiOS|mercury/i.test(navigator.userAgent)
  );

  if (isIOS) {
    await page.focus('#dl-csv-btn');
    await page.keyboard.press('Enter');
    const blobUrl = await page.locator('#ios-save-link').evaluate(
      el => (el as HTMLAnchorElement).href
    );
    expect(blobUrl).toMatch(/^blob:/);
  } else {
    await page.focus('#dl-csv-btn');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('dl-csv-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ]);
    expect(await download.path()).toBeTruthy();
  }
});
