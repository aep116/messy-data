import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  unlockTool,
  uploadCSV,
  runQuickClean,
  processAndWaitForDownload,
  downloadCSV,
  parseCSV,
  triggerDownload,
  triggerContinue,
  triggerDownloadGetFilename,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// TC-DG-92 — CSV download: filename is sanitized (no special chars)
test('TC-DG-92: downloaded filename contains only alphanumeric chars and hyphens', async ({ page }, testInfo) => {
  // Create temp file with special chars in name
  const tmpPath = path.join(__dirname, '..', 'fixtures', '__My Messy Data!! (2026).csv');
  fs.writeFileSync(tmpPath, 'first_name,last_name,email\nJohn,Smith,JOHN@ACME.COM\n');
  try {
    await page.locator('input[type="file"]').setInputFiles(tmpPath);
    await page.waitForSelector('#file-info', { state: 'visible' });
    await runQuickClean(page);
    await processAndWaitForDownload(page);
    const filename = await triggerDownloadGetFilename(page);
    // Only alphanumeric, hyphens, and .csv extension
    const baseName = filename.replace(/\.csv$/, '').replace(/-cleaned$|-verified$/, '');
    expect(baseName).toMatch(/^[a-zA-Z0-9-]+$/);
    expect(baseName).not.toMatch(/[ !@#$%^&*()\[\]{}|<>?,./\\+=`~]/);
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

// TC-DG-93 — CSV download: filename ends in -cleaned for changed files
test('TC-DG-93: downloaded filename ends in -cleaned for files with changes', async ({ page }) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const filename = await triggerDownloadGetFilename(page);
  expect(filename).toContain('-cleaned');
  expect(filename).not.toContain('-verified');
});

// TC-DG-94 — CSV download: filename ends in -verified for unchanged files
test('TC-DG-94: downloaded filename ends in -verified for already-clean files', async ({ page }) => {
  await uploadCSV(page, '11-already-clean.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const filename = await triggerDownloadGetFilename(page);
  expect(filename).toContain('-verified');
  expect(filename).not.toContain('-cleaned');
});

// TC-DG-95 — CSV download: UTF-8 BOM present in output
test('TC-DG-95: downloaded CSV has UTF-8 BOM as first 3 bytes', async ({ page }, testInfo) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  const isIOS = await page.evaluate(() =>
    /iP(ad|hone|od)/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|OPiOS|mercury/i.test(navigator.userAgent)
  );

  let rawBytes: number[];
  if (isIOS) {
    await page.click('#dl-csv-btn');
    const blobUrl = await page.locator('#ios-save-link').evaluate(
      el => (el as HTMLAnchorElement).href
    );
    rawBytes = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }, blobUrl);
  } else {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dl-csv-btn'),
    ]);
    const filePath = await download.path();
    rawBytes = Array.from(fs.readFileSync(filePath!));
  }

  expect(rawBytes[0]).toBe(0xEF);
  expect(rawBytes[1]).toBe(0xBB);
  expect(rawBytes[2]).toBe(0xBF);
});

// TC-DG-96 — CSV download: RFC 4180 quoting preserved for embedded commas
test('TC-DG-96: embedded commas in fields survive clean and download', async ({ page }) => {
  await uploadCSV(page, '16-quoted-commas.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  const john = rows.find(r => r.first_name === 'John');
  expect(john?.last_name).toBe('Smith, Jr.');
  expect(john?.company).toBe('Acme, Inc.');
});

// TC-DG-97 — XLSX download: sheet name is "Cleaned"
test('TC-DG-97: XLSX download produces workbook with sheet named Cleaned', async ({ page }, testInfo) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await page.evaluate(() => {
    const cb = document.getElementById('t-excel') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#dl-xlsx-btn')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dl-xlsx-btn'),
  ]);
  const filePath = await download.path();
  const bytes = fs.readFileSync(filePath!);
  // XLSX is ZIP — extract and check for "Cleaned" sheet name in the XML
  const content = bytes.toString('utf-8', 0, Math.min(bytes.length, 50000));
  // Sheet name "Cleaned" appears in workbook.xml or xl/workbook.xml
  expect(content).toMatch(/Cleaned/);
});

// TC-DG-98 — XLSX download: CDN blocked → error message shown, CSV still works
test('TC-DG-98: blocked SheetJS CDN shows error, CSV download still works', async ({ page }) => {
  await page.route('**/xlsx*', route => route.abort());
  await page.reload();
  await expect(page.locator('#tool-view')).toBeVisible();
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await page.evaluate(() => {
    const cb = document.getElementById('t-excel') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#dl-xlsx-btn')).toBeVisible();
  await page.click('#dl-xlsx-btn');
  await page.waitForFunction(
    () => {
      const el = document.getElementById('xlsx-error');
      return el && el.style.display !== 'none' && el.textContent!.trim().length > 0;
    },
    { timeout: 5000 }
  );
  const errText = await page.locator('#xlsx-error').innerText();
  expect(errText.trim().length).toBeGreaterThan(0);
  // CSV download still works
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  expect(rows.length).toBeGreaterThan(0);
});

// TC-DG-99 — iOS Safari: ios-save-area shown instead of auto-download
test('TC-DG-99: iOS shows ios-save-area instead of triggering auto-download', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await page.click('#dl-csv-btn');
  await expect(page.locator('#ios-save-area')).toBeVisible();
  await expect(page.locator('#ios-save-link')).toBeVisible();
});

// TC-DG-100 — iOS Safari: Continue button navigates to win.html
test('TC-DG-100: iOS Continue button navigates to win.html with params', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await page.click('#dl-csv-btn');
  await expect(page.locator('#ios-save-area')).toBeVisible();
  await page.click('#ios-continue-btn');
  await page.waitForURL(/win\.html/, { timeout: 5000 });
  expect(page.url()).toContain('win.html');
  expect(page.url()).toContain('rows=');
  expect(page.url()).toContain('changed=');
});

// TC-DG-101 — Desktop: win.html redirect fires after ~1s
test('TC-DG-101: desktop redirect to win.html fires after 1 second', async ({ page }, testInfo) => {
  if (['mobile-safari', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await Promise.all([
    page.waitForEvent('download'),
    page.click('#dl-csv-btn'),
  ]);
  // Wait for redirect
  await page.waitForURL(/win\.html/, { timeout: 5000 });
  expect(page.url()).toContain('win.html');
});

// TC-DG-102 — Desktop: redirect cancelled by cleanAnother within 1s
test('TC-DG-102: cleanAnother within 1s cancels win.html redirect', async ({ page }, testInfo) => {
  if (['mobile-safari', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  await Promise.all([
    page.waitForEvent('download'),
    page.click('#dl-csv-btn'),
  ]);
  // Immediately cancel
  await page.click('#clean-another-btn');
  // Wait past redirect window
  await page.waitForTimeout(2000);
  expect(page.url()).toContain('app.html');
  expect(page.url()).not.toContain('win.html');
});
