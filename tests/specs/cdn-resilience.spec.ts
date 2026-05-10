import { test, expect } from '@playwright/test';
import * as path from 'path';
import { downloadCSV, parseCSV } from './helpers';

// No shared beforeEach — route must be registered before page.goto().

// ── TC35: Levenshtein CDN blocked — non-fuzzy cleaning unaffected ─
test('TC35: non-fuzzy cleaning works when Levenshtein CDN is unavailable', async ({ page }) => {
  // Block the Levenshtein script before page load
  await page.route('**/levenshtein*', route => route.abort());

  // Unlock without using the helper's goto — addInitScript must fire before navigation
  await page.addInitScript(() => {
    localStorage.setItem('cleanlist_v1_order_id', 'TEST-ORDER-123');
    localStorage.setItem('cleanlist_cookie_dismissed', 'true');
  });

  await page.goto('http://localhost:4321/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();

  // Upload and run Quick Clean — fuzzy is off by default, so Levenshtein is never called
  const fixturePath = path.join(__dirname, '..', 'fixtures', '01-exact-duplicates.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  // Stats show duplicates removed — app is functional
  const stats = await page.locator('#stats-block').innerText();
  expect(stats).toContain('2');

  await page.click('#process-btn');
  await page.waitForSelector('#download-section', { state: 'visible' });

  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  // 4 rows remain — dedup, email, phone all ran correctly without Levenshtein
  expect(rows.length).toBe(4);
});

// ── TC40: Levenshtein CDN blocked + fuzzy enabled → graceful error ─
test('TC40: fuzzy dedup with CDN blocked shows error instead of hanging', async ({ page }) => {
  await page.route('**/levenshtein*', route => route.abort());

  await page.addInitScript(() => {
    localStorage.setItem('cleanlist_v1_order_id', 'TEST-ORDER-123');
    localStorage.setItem('cleanlist_cookie_dismissed', 'true');
  });

  await page.goto('http://localhost:4321/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();

  // Upload a file with name columns so Levenshtein is actually invoked
  const fixturePath = path.join(__dirname, '..', 'fixtures', '15-fuzzy-dedup.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });

  // Enable fuzzy and run cleaning — Levenshtein.get() will throw since CDN is blocked
  await page.evaluate(() => {
    const cb = document.getElementById('t-fuzzy') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    (window as any).runCleaning((window as any).getSettings());
  });

  // App must show an error message — not hang silently or crash
  await page.waitForFunction(
    () => (document.getElementById('msg-file-err')?.textContent ?? '').trim().length > 0,
    { timeout: 10000 }
  );
  const errText = await page.locator('#msg-file-err').innerText();
  expect(errText.trim().length).toBeGreaterThan(0);
});
