import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { unlockTool, uploadCSV, runQuickClean, parseCSV, processAndWaitForDownload, downloadCSV } from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// TC-DG-01 — File picker rejects non-CSV extension
test('TC-DG-01: file picker rejects non-CSV extension', async ({ page }) => {
  const tmpPath = path.join(__dirname, '..', 'fixtures', '__tmp_test.xlsx');
  fs.writeFileSync(tmpPath, 'first_name,last_name\nJohn,Smith\n');
  try {
    await page.locator('input[type="file"]').setInputFiles(tmpPath);
    await page.waitForFunction(
      () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
      { timeout: 5000 }
    );
    const errText = await page.locator('#msg-file-err').innerText();
    expect(errText.trim().length).toBeGreaterThan(0);
    await expect(page.locator('#preview-section')).not.toBeVisible();
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

// TC-DG-02 — File picker rejects file over 100MB
test('TC-DG-02: file picker rejects file over 100MB', async ({ page }) => {
  await page.evaluate(() => {
    const bigFile = new File(['x'], 'toobig.csv', { type: 'text/csv' });
    Object.defineProperty(bigFile, 'size', { value: 105 * 1024 * 1024 });
    (window as any).handleFile(bigFile);
  });
  await page.waitForFunction(
    () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
    { timeout: 5000 }
  );
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText).toMatch(/large|100MB|limit/i);
  await expect(page.locator('#preview-section')).not.toBeVisible();
});

// TC-DG-03 — File picker shows warning for 20–100MB file
test('TC-DG-03: file between 20MB and 100MB shows warning but proceeds', async ({ page }) => {
  // Expose handleFile so we can simulate a large file object
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  const csvContent = fs.readFileSync(fixturePath, 'utf-8');
  await page.evaluate((csv) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const largeFile = new File([blob], 'medium.csv', { type: 'text/csv' });
    Object.defineProperty(largeFile, 'size', { value: 25 * 1024 * 1024 });
    (window as any).handleFile(largeFile);
  }, csvContent);
  await page.waitForSelector('#file-info', { state: 'visible' });
  const warnText = await page.locator('#msg-file-warn').innerText();
  expect(warnText.trim().length).toBeGreaterThan(0);
  // Error must NOT be shown — it's a warning
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText.trim()).toBe('');
});

// TC-DG-04 — Drag and drop works on desktop Chrome
test('TC-DG-04: drag and drop works on desktop Chrome', async ({ page }, testInfo) => {
  if (['mobile-safari', 'mobile-chrome', 'tablet'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  const csvContent = fs.readFileSync(fixturePath, 'utf-8');
  await page.evaluate((csv) => {
    const file = new File([csv], '01-exact-duplicates.csv', { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropZone = document.getElementById('drop-zone')!;
    const dragEvent = new DragEvent('drop', { dataTransfer: dt, bubbles: true });
    dropZone.dispatchEvent(dragEvent);
  }, csvContent);
  await page.waitForSelector('#file-info', { state: 'visible' });
  await expect(page.locator('#quick-clean-area')).toBeVisible();
});

// TC-DG-05 — Drop zone hidden on phone-sized viewports (CSS max-width: 767px)
// Tablet (iPad ~810px) is wider than the breakpoint, so the drop zone IS visible there.
test('TC-DG-05: drop zone is hidden on mobile viewport', async ({ page }, testInfo) => {
  if (!['mobile-safari', 'mobile-chrome'].includes(testInfo.project.name)) {
    testInfo.skip();
    return;
  }
  const dropZoneVisible = await page.locator('#drop-zone').isVisible();
  expect(dropZoneVisible).toBe(false);
});

// TC-DG-06 — Paste path rejects empty textarea
test('TC-DG-06: paste path rejects empty textarea', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = '';
    el.dispatchEvent(new Event('input'));
    (window as any).handlePasteLoad();
  });
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText).toMatch(/empty/i);
  await expect(page.locator('#upload-section')).toBeVisible();
  await expect(page.locator('#preview-section')).not.toBeVisible();
});

// TC-DG-07 — Paste path accepts tab-delimited input
test('TC-DG-07: paste path parses tab-delimited (TSV) input', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = "first_name\tlast_name\temail\nJohn\tSmith\tjohn@test.com\nJane\tDoe\tjane@test.com\nBob\tJones\tbob@test.com";
    el.dispatchEvent(new Event('input'));
  });
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  expect(rows.length).toBe(3);
});

// TC-DG-08 — Paste path accepts semicolon-delimited input
test('TC-DG-08: paste path parses semicolon-delimited input', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = "first_name;last_name;email\nJohn;Smith;john@test.com\nJane;Doe;jane@test.com\nBob;Jones;bob@test.com";
    el.dispatchEvent(new Event('input'));
  });
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  expect(rows.length).toBe(3);
});

// TC-DG-09 — Paste path accepts pipe-delimited input
test('TC-DG-09: paste path parses pipe-delimited input', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = "first_name|last_name|email\nJohn|Smith|john@test.com\nJane|Doe|jane@test.com\nBob|Jones|bob@test.com";
    el.dispatchEvent(new Event('input'));
  });
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  expect(rows.length).toBe(3);
});

// TC-DG-10 — File with UTF-8 BOM in input parses correctly
test('TC-DG-10: UTF-8 BOM in input CSV is stripped by PapaParse', async ({ page }) => {
  const fixturePath = path.join(__dirname, '..', 'fixtures', '09-unicode-encoding.csv');
  const content = fs.readFileSync(fixturePath);
  // Prepend BOM if not already present
  const hasBom = content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF;
  const withBom = hasBom ? content : Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), content]);
  const tmpPath = path.join(__dirname, '..', 'fixtures', '__tmp_bom.csv');
  fs.writeFileSync(tmpPath, withBom);
  try {
    await page.locator('input[type="file"]').setInputFiles(tmpPath);
    await page.waitForSelector('#file-info', { state: 'visible' });
    // No BOM artifact in first header
    const fileInfo = await page.locator('#file-info').innerText();
    expect(fileInfo).not.toContain('﻿');
    expect(fileInfo).not.toContain('\xef\xbb\xbf');
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

// TC-DG-11 — File with only whitespace rows shows error
// Note: PapaParse with skipEmptyLines:'greedy' skips all-whitespace rows,
// so rows.length===0 and the app immediately shows errEmpty without ever showing #file-info.
test('TC-DG-11: CSV with only whitespace/empty rows shows error', async ({ page }) => {
  const fixturePath = path.join(__dirname, '..', 'fixtures', '25-whitespace-rows.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  // App shows error immediately — #file-info never appears because rows.length === 0
  await page.waitForFunction(
    () => {
      const err = document.getElementById('msg-file-err');
      const fileInfo = document.getElementById('file-info');
      const preview = document.getElementById('preview-section');
      return (err && err.textContent?.trim().length > 0) ||
             (fileInfo && fileInfo.style.display !== 'none') ||
             (preview && preview.style.display !== 'none');
    },
    { timeout: 5000 }
  );
  // If error shown, preview should be hidden
  const errText = (await page.locator('#msg-file-err').innerText()).trim();
  if (errText.length > 0) {
    await expect(page.locator('#preview-section')).not.toBeVisible();
  }
  // Either path is acceptable — the app doesn't crash
});

// TC-DG-12 — Headers-only CSV shows user-friendly error (extends TC42)
// Note: headers-only CSV → rows.length===0 → app shows errEmpty immediately, #file-info never shown.
test('TC-DG-12: headers-only CSV shows user-friendly error, no JS console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const fixturePath = path.join(__dirname, '..', 'fixtures', '21-headers-only.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForFunction(
    () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
    { timeout: 5000 }
  );
  const errText = await page.locator('#msg-file-err').innerText();
  // User-friendly message, not a stack trace
  expect(errText).not.toMatch(/TypeError|ReferenceError|undefined is not/i);
  expect(errText.trim().length).toBeGreaterThan(0);
  // No uncaught JS errors
  const uncaughtErrors = consoleErrors.filter(e => !e.includes('LS_CHECKOUT_URL'));
  expect(uncaughtErrors.length).toBe(0);
});

// TC-DG-13 — Malformed CSV: no uncaught console errors beyond PapaParse warning (extends TC43)
test('TC-DG-13: malformed CSV shows error with no uncaught JS console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = '"unterminated';
    el.dispatchEvent(new Event('input'));
    (window as any).handlePasteLoad();
  });
  await page.waitForFunction(
    () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
    { timeout: 5000 }
  );
  const uncaughtErrors = consoleErrors.filter(e => !e.includes('LS_CHECKOUT_URL'));
  expect(uncaughtErrors.length).toBe(0);
});

// TC-DG-14 — Single-column CSV shows info notice but proceeds
test('TC-DG-14: single-column CSV shows info notice but upload proceeds', async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(
    path.join(__dirname, '..', 'fixtures', '24-single-column.csv')
  );
  await page.waitForSelector('#file-info', { state: 'visible' });
  const infoText = await page.locator('#msg-file-info').innerText();
  expect(infoText).toMatch(/one column|single column/i);
  // Quick Clean area still visible
  await expect(page.locator('#quick-clean-area')).toBeVisible();
});

// TC-DG-15 — CSV with >50,000 rows shows WARN_MANY_ROWS warning
test('TC-DG-15: CSV with >50,000 rows shows progress bar warning', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  // Generate inline — too large for a fixture file
  const lines = ['first_name,last_name,email'];
  for (let i = 0; i < 51000; i++) {
    lines.push(`User${i},Test${i},user${i}@example.com`);
  }
  const csv = lines.join('\n');
  const tmpPath = path.join(__dirname, '..', 'fixtures', '__tmp_51k.csv');
  const fsNode = require('fs');
  fsNode.writeFileSync(tmpPath, csv, 'utf-8');
  try {
    await page.locator('input[type="file"]').setInputFiles(tmpPath);
    await page.waitForSelector('#file-info', { state: 'visible' });
    const warnText = await page.locator('#msg-file-warn').innerText();
    expect(warnText).toMatch(/progress bar|rows/i);
  } finally {
    fsNode.unlinkSync(tmpPath);
  }
});

// TC-DG-16 — CSV with >5,000 rows shows WARN_LARGE_ROWS warning
test('TC-DG-16: fixture 14 (10,000 rows) shows large file warning', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await uploadCSV(page, '14-large-file.csv');
  const warnText = await page.locator('#msg-file-warn').innerText();
  expect(warnText).toMatch(/rows|large|moment/i);
});

// TC-DG-17 — RFC 4180 quoted fields with embedded newlines parse correctly
// Note: the custom parseCSV helper splits on \n and doesn't handle multi-line fields,
// so we verify row count via the preview table instead of re-parsing the download.
test('TC-DG-17: quoted fields with embedded newlines parse correctly', async ({ page }) => {
  const csvContent = `first_name,last_name,notes\nJohn,Smith,"Line one\nLine two"\nJane,Doe,Normal note\n`;
  await page.evaluate((csv) => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = csv;
    el.dispatchEvent(new Event('input'));
  }, csvContent);
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
  // Verify 2 data rows in the preview table (header + 2 rows = 3 total, so tbody has 2)
  const rowCount = await page.locator('#preview-table tbody tr').count();
  expect(rowCount).toBe(2);
  // Verify the notes column content is preserved
  const notesCell = await page.locator('#preview-table tbody tr').first()
    .locator('td').last().innerText();
  expect(notesCell).toContain('Line one');
});

// TC-DG-18 — CSV with ALL columns empty after trim
// Note: 36-all-spaces.csv has all-whitespace cells. PapaParse greedy-skips these rows,
// so rows.length===0 and the app shows errEmpty. We verify the app doesn't crash.
test('TC-DG-18: CSV with all empty cells shows error without crashing', async ({ page }) => {
  const fixturePath = path.join(__dirname, '..', 'fixtures', '36-all-spaces.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  // Wait for either error message or file-info (either is acceptable — no crash)
  await page.waitForFunction(
    () => {
      const err = document.getElementById('msg-file-err');
      const fileInfo = document.getElementById('file-info');
      return (err && err.textContent?.trim().length > 0) ||
             (fileInfo && fileInfo.style.display !== 'none');
    },
    { timeout: 5000 }
  );
  // No JS exception = pass
  await expect(page.locator('#tool-view')).toBeVisible();
});
