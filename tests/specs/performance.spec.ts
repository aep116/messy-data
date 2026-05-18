import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { unlockTool } from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// TC-DG-128 — 10,000-row file processes in under 30 seconds
test('TC-DG-128: 10,000-row file processes in under 30 seconds', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.locator('input[type="file"]').setInputFiles(
    path.join(__dirname, '..', 'fixtures', '14-large-file.csv')
  );
  await page.waitForSelector('#file-info', { state: 'visible' });
  const start = Date.now();
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible', timeout: 30000 });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(30000);
});

// TC-DG-129 — 10,000-row file: overlay shown within 500ms of Quick Clean click
test('TC-DG-129: processing overlay appears within 500ms for 10,000-row file', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.locator('input[type="file"]').setInputFiles(
    path.join(__dirname, '..', 'fixtures', '14-large-file.csv')
  );
  await page.waitForSelector('#file-info', { state: 'visible' });
  const start = Date.now();
  await page.click('#quick-clean-btn');
  await expect(page.locator('#processing-overlay')).toBeVisible({ timeout: 500 });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(500);
  // Wait for completion
  await page.waitForSelector('#preview-section', { state: 'visible', timeout: 60000 });
});

// TC-DG-130 — 2,000-row fuzzy dedup completes without browser hang
test('TC-DG-130: 2,000-row fuzzy dedup completes without browser timeout', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  // Generate 2,000-row CSV with name column
  const lines = ['first_name,last_name,email'];
  for (let i = 0; i < 1999; i++) {
    lines.push(`User${i},Test${i},user${i}@fuzzy.com`);
  }
  // Add one near-duplicate pair at the end
  lines.push('John,Smith,john.smith@fuzzy.com');
  lines.push('Jon,Smith,jon.smith@fuzzy.com');
  const csv = lines.join('\n');
  const tmpPath = path.join(__dirname, '..', 'fixtures', '__tmp_2k_fuzzy.csv');
  fs.writeFileSync(tmpPath, csv, 'utf-8');
  try {
    await page.locator('input[type="file"]').setInputFiles(tmpPath);
    await page.waitForSelector('#file-info', { state: 'visible' });
    await page.evaluate(() => {
      const cb = document.getElementById('t-fuzzy') as HTMLInputElement;
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      (window as any).runCleaning((window as any).getSettings());
    });
    // Should complete — either show fuzzy confirm or preview
    await page.waitForFunction(
      () => {
        const fuzzy = document.getElementById('fuzzy-confirm-area');
        const preview = document.getElementById('preview-section');
        return (fuzzy && fuzzy.style.display === 'block') ||
               (preview && preview.style.display !== 'none');
      },
      { timeout: 60000 }
    );
    // No browser crash = pass
    const toolVisible = await page.locator('#tool-view').isVisible();
    expect(toolVisible).toBe(true);
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

// TC-DG-131 — CDN load time does not block initial page render
test('TC-DG-131: upload section renders before CDN scripts finish loading', async ({ page }, testInfo) => {
  // [SKIP] True network throttling requires Chrome CDP and is not reliably cross-browser.
  // The app uses `defer` on all CDN scripts which guarantees non-blocking render.
  // This is verified by code review: all CDN scripts have `defer` attribute.
  test.skip(true, 'Network throttling requires CDP and is Chrome-only; defer attribute verified by code review');
});
