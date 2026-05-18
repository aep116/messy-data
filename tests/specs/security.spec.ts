import { test, expect } from '@playwright/test';
import { unlockTool } from './helpers';

// TC-DG-118 — X-Frame-Options: DENY header
test('TC-DG-118: X-Frame-Options: DENY header present', async ({ page, request }) => {
  // [SKIP] Security headers are set by Vercel in production via vercel.json.
  // The local `serve` development server does not apply vercel.json headers.
  // This test is only verifiable against a deployed build.
  test.skip(true, 'Security headers are applied by Vercel in production only; not testable via local serve');
});

// TC-DG-119 — X-Content-Type-Options: nosniff header
test('TC-DG-119: X-Content-Type-Options: nosniff header present', async ({ page }) => {
  test.skip(true, 'Security headers are applied by Vercel in production only; not testable via local serve');
});

// TC-DG-120 — CSP header present and references correct CDN sources
test('TC-DG-120: Content-Security-Policy header present with CDN sources', async ({ page }) => {
  test.skip(true, 'Security headers are applied by Vercel in production only; not testable via local serve');
});

// TC-DG-121 — Permissions-Policy disables camera, microphone, geolocation
test('TC-DG-121: Permissions-Policy header disables camera, microphone, geolocation', async ({ page }) => {
  test.skip(true, 'Security headers are applied by Vercel in production only; not testable via local serve');
});

// TC-DG-122 — SRI hashes present on all three CDN scripts
test('TC-DG-122: all CDN scripts have SRI integrity attributes', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await page.waitForLoadState('domcontentloaded');

  // PapaParse
  const papaSrc = await page.locator('script[src*="papaparse"]').getAttribute('integrity');
  expect(papaSrc).toBeTruthy();
  expect(papaSrc).toMatch(/^sha384-/);

  // Levenshtein
  const levSrc = await page.locator('script[src*="levenshtein"]').getAttribute('integrity');
  expect(levSrc).toBeTruthy();
  expect(levSrc).toMatch(/^sha384-/);

  // SheetJS
  const xlsxSrc = await page.locator('script[src*="xlsx"]').getAttribute('integrity');
  expect(xlsxSrc).toBeTruthy();
  expect(xlsxSrc).toMatch(/^sha384-/);

  // All have crossorigin
  const papaCross = await page.locator('script[src*="papaparse"]').getAttribute('crossorigin');
  expect(papaCross).toBe('anonymous');
});

// TC-DG-123 — XSS via filename: special chars escaped in UI
test('TC-DG-123: XSS in filename is escaped in UI display', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();

  const pageerrors: string[] = [];
  page.on('pageerror', err => pageerrors.push(err.message));

  // Create a CSV file with XSS name
  const xssFilename = '<img src=x onerror=alert(1)>.csv';
  const tmpPath = require('path').join(__dirname, '..', 'fixtures', '__xss_test.csv');
  require('fs').writeFileSync(tmpPath, 'first_name,email\nJohn,john@test.com\n');

  try {
    // Set file with XSS name via evaluate
    const csvContent = require('fs').readFileSync(tmpPath, 'utf-8');
    await page.evaluate((csv) => {
      const file = new File([csv], '<img src=x onerror=alert(1)>.csv', { type: 'text/csv' });
      const input = document.getElementById('file-input') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(input, 'files', { value: dt.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, csvContent);
    await page.waitForSelector('#file-info', { state: 'visible' });
    // No alert fired, no pageerror
    expect(pageerrors.length).toBe(0);
    // File info should show escaped text — no live <img onerror= tag in DOM
    const fileInfoHtml = await page.locator('#file-info').innerHTML();
    expect(fileInfoHtml).not.toMatch(/<img[^>]+onerror/);
  } finally {
    require('fs').unlinkSync(tmpPath);
  }
});

// TC-DG-124 — XSS via CSV content: cell values escaped in preview
test('TC-DG-124: XSS in CSV cell values is escaped in preview table', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();

  const pageerrors: string[] = [];
  page.on('pageerror', err => pageerrors.push(err.message));

  const xssContent = 'first_name,last_name,email\n<script>alert(1)</script>,Smith,john@test.com\n';
  await page.evaluate((csv) => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = csv;
    el.dispatchEvent(new Event('input'));
  }, xssContent);
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  // No script execution
  expect(pageerrors.length).toBe(0);
  // Table should show escaped text
  const tableHtml = await page.locator('#preview-table').innerHTML();
  expect(tableHtml).not.toMatch(/<script>/);
});

// TC-DG-125 — XSS via CSV content in fuzzy label
test('TC-DG-125: XSS in fuzzy pair labels is escaped', async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();

  const pageerrors: string[] = [];
  page.on('pageerror', err => pageerrors.push(err.message));

  // Enable fuzzy before paste so runCleaning picks it up
  await page.evaluate(() => {
    const cb = document.getElementById('t-fuzzy') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const xssContent = 'first_name,last_name,email\n<img src=x onerror=alert(1)>,Smith,john@test.com\n<img src=x onerror=alert(2)>,Smith,jon@test.com\n';
  await page.evaluate((csv) => {
    const el = document.getElementById('paste-area') as HTMLTextAreaElement;
    el.style.display = 'block';
    el.value = csv;
    el.dispatchEvent(new Event('input'));
  }, xssContent);
  // Click quick-clean-btn to trigger handlePasteLoad + runCleaning (populates parsedRows)
  await page.click('#quick-clean-btn');

  // Either fuzzy confirm appears or preview — either way no script execution
  await page.waitForFunction(
    () => {
      const fuzzy = document.getElementById('fuzzy-confirm-area');
      const preview = document.getElementById('preview-section');
      return (fuzzy && fuzzy.style.display === 'block') ||
             (preview && preview.style.display !== 'none');
    },
    { timeout: 10000 }
  );

  expect(pageerrors.length).toBe(0);
  // No raw onerror in rendered HTML
  const bodyHtml = await page.locator('body').innerHTML();
  expect(bodyHtml).not.toMatch(/onerror=alert/);
});

// TC-DG-126 — order_number XSS attempt via URL rejected
test('TC-DG-126: XSS in order_number URL param is rejected and not executed', async ({ browser }) => {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const pageerrors: string[] = [];
  pg.on('pageerror', err => pageerrors.push(err.message));
  try {
    const xss = encodeURIComponent('<script>alert(1)</script>');
    await pg.goto(`http://localhost:4321/app.html?order_number=${xss}`);
    await pg.waitForLoadState('domcontentloaded');
    expect(pageerrors.length).toBe(0);
    const stored = await pg.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBeNull();
    await expect(pg.locator('#locked-view')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// TC-DG-127 — order_number SQL-like injection rejected
test('TC-DG-127: SQL injection attempt in order_number is rejected by regex', async ({ browser }) => {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  try {
    const sqlInjection = encodeURIComponent("'; DROP TABLE users; --");
    await pg.goto(`http://localhost:4321/app.html?order_number=${sqlInjection}`);
    await pg.waitForLoadState('domcontentloaded');
    const stored = await pg.evaluate(() => localStorage.getItem('cleanlist_v1_order_id'));
    expect(stored).toBeNull();
    await expect(pg.locator('#locked-view')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
