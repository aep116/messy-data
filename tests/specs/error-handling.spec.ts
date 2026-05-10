import { test, expect } from '@playwright/test';
import * as path from 'path';
import { unlockTool } from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// ── TC41: Empty paste input shows error ───────────────────────────
test('TC41: empty paste input shows error message', async ({ page }) => {
  // Reveal the paste area and submit with empty content
  await page.evaluate(() => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = '';
    el.dispatchEvent(new Event('input'));
  });

  // Trigger paste load with empty value
  await page.evaluate(() => {
    (window as any).handlePasteLoad();
  });

  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText).toMatch(/empty/i);

  // Upload section must remain visible — app must not advance past this state
  await expect(page.locator('#upload-section')).toBeVisible();
  await expect(page.locator('#preview-section')).not.toBeVisible();
});

// ── TC42: Headers-only CSV shows error ───────────────────────────
test('TC42: headers-only CSV file shows error message', async ({ page }) => {
  const fixturePath = path.join(__dirname, '..', 'fixtures', '21-headers-only.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);

  // Error must appear — no data rows means app cannot proceed
  await page.waitForFunction(
    () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
    { timeout: 5000 }
  );
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText.trim().length).toBeGreaterThan(0);

  await expect(page.locator('#preview-section')).not.toBeVisible();
});

// ── TC43: Malformed CSV (unterminated quote) shows error ──────────
test('TC43: malformed CSV with unterminated quote shows error message', async ({ page }) => {
  // An unterminated opening quote causes PapaParse to consume the whole file
  // without producing any data rows, triggering errNotCsvWithHelp
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
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText.trim().length).toBeGreaterThan(0);

  await expect(page.locator('#preview-section')).not.toBeVisible();
});
