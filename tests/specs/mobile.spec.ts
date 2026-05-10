import { test, expect } from '@playwright/test';
import * as path from 'path';
import { unlockTool, uploadCSV, runQuickClean, processAndWaitForDownload, downloadCSV, parseCSV, triggerDownload } from './helpers';

// All tests in this file are mobile/tablet only.
// On desktop projects they are skipped automatically.
test.beforeEach(async ({ page }, testInfo) => {
  if (!['mobile-safari', 'mobile-chrome', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// ── TC36: Paste CSV path works at mobile viewport ─────────────────
test('TC36: paste CSV path cleans and downloads on mobile viewport', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'mobile-chrome', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }

  const csvContent = `first_name,last_name,email
John,Smith,JOHN@TEST.COM
Jane,Doe,JANE@TEST.COM
John,Smith,JOHN@TEST.COM`;

  // Reveal and fill paste textarea (hidden by default, same as desktop)
  await page.evaluate((csv) => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = csv;
    el.dispatchEvent(new Event('input'));
  }, csvContent);

  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);
  expect(rows[0].email).toBe('john@test.com');
  expect(rows[1].email).toBe('jane@test.com');
});

// ── TC37: Key interactive elements meet 44px touch target minimum ─
test('TC37: interactive buttons meet 44px minimum touch target height', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'mobile-chrome', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }

  const getHeight = (id: string) =>
    page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().height);

  // Upload a file first — quick-clean-btn is only rendered/visible after a file is selected
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  // Quick Clean and advanced toggle must meet 44px minimum touch target
  expect(await getHeight('quick-clean-btn')).toBeGreaterThanOrEqual(44);

  // Advanced settings toggle row
  expect(await getHeight('adv-toggle-row')).toBeGreaterThanOrEqual(44);

  // Run Quick Clean to expose process button
  await runQuickClean(page);
  expect(await getHeight('process-btn')).toBeGreaterThanOrEqual(44);

  // Process to expose download button
  await processAndWaitForDownload(page);
  expect(await getHeight('dl-csv-btn')).toBeGreaterThanOrEqual(44);
});

// ── TC38: No horizontal overflow at mobile viewport width ─────────
test('TC38: page has no horizontal overflow at mobile viewport', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'mobile-chrome', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }

  // Check at rest (no file loaded)
  const overflowAtRest = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflowAtRest).toBe(false);

  // Upload and clean — expanded UI must also fit
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  const overflowAfterClean = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflowAfterClean).toBe(false);
});

// ── TC39: iOS download does not auto-redirect — Continue required ──
test('TC39: iOS download shows save area but does not auto-redirect', async ({ page }, testInfo) => {
  // Only meaningful on iOS/iPadOS — these are the projects that show the blob-link UI
  if (!['mobile-safari', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }

  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
  await page.click('#process-btn');
  await page.waitForSelector('#download-section', { state: 'visible' });

  // Trigger download — shows iOS save area, no redirect timer is started
  await triggerDownload(page);

  // Wait longer than the desktop 1-second redirect timeout
  await page.waitForTimeout(2000);

  // Must still be on app.html — redirect only fires when user taps Continue
  expect(page.url()).toContain('app.html');
  expect(page.url()).not.toContain('win.html');
  await expect(page.locator('#ios-save-area')).toBeVisible();
  await expect(page.locator('#ios-save-link')).toBeVisible();
});
