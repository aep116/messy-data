import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  unlockTool,
  uploadCSV,
  runQuickClean,
  processAndWaitForDownload,
  downloadCSV,
  parseCSV,
  getStatText,
  triggerDownload,
  triggerContinue,
  triggerDownloadGetFilename,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await unlockTool(page);
  await page.goto('/app.html');
  await expect(page.locator('#tool-view')).toBeVisible();
});

// ── TC01: Exact duplicate removal ─────────────────────────────────
test('TC01: removes exact duplicate rows', async ({ page }) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);

  const stats = await getStatText(page);
  expect(stats).toContain('2');

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(4);
  const johnRows = rows.filter(r => r.first_name === 'John' && r.last_name === 'Smith');
  expect(johnRows.length).toBe(1);
});

// ── TC02: Email deduplication — keeps first occurrence ────────────
test('TC02: deduplicates by email, keeps first occurrence', async ({ page }) => {
  await uploadCSV(page, '02-email-dedup.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(3);
  const johnRow = rows.find(r => r.email === 'john@acme.com');
  expect(johnRow?.last_name).toBe('Smith');
  const janeRow = rows.find(r => r.email === 'jane@acme.com');
  expect(janeRow?.company).toBe('Acme Corp');
});

// ── TC03: Email lowercasing and isAlreadyClean false positive guard
test('TC03: lowercases emails and marks file as changed', async ({ page }) => {
  await uploadCSV(page, '03-email-casing.csv');
  await runQuickClean(page);

  const stats = await getStatText(page);
  expect(stats).toMatch(/email/i);

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  rows.forEach(row => {
    expect(row.email).toBe(row.email.toLowerCase());
  });

  const summary = await page.locator('#dl-summary').innerText();
  expect(summary).not.toMatch(/no changes were made/i);
  expect(summary).not.toMatch(/identical to your original/i);
});

// ── TC04: win.html changed=1 for email-casing-only file ───────────
test('TC04: win.html receives changed=1 for email-only casing', async ({ page }) => {
  await uploadCSV(page, '12-email-casing-only.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  // Click download — triggers file download + starts 1-sec redirect timer (desktop)
  // or shows iOS save area + Continue button (iOS).
  await triggerDownload(page);
  await triggerContinue(page);

  await page.waitForURL(/win\.html/, { timeout: 5000 });
  const params = new URLSearchParams(new URL(page.url()).search);

  expect(params.get('changed')).toBe('1');
  expect(params.get('removed')).toBe('0');

  // Verify win.html shows standard card (not already-clean)
  await page.waitForLoadState('domcontentloaded');
  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).not.toMatch(/already clean/i);
});

// ── TC05: Phone number standardization ───────────────────────────
test('TC05: formats US phones, preserves international', async ({ page }) => {
  await uploadCSV(page, '05-phone-numbers.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  const byName = (name: string) => rows.find(r => r.name === name)?.phone ?? '';

  expect(byName('US 10-digit')).toBe('(555) 123-4567');
  expect(byName('US 10-digit formatted')).toBe('(555) 123-4567');
  expect(byName('US 11-digit')).toBe('+1 (555) 123-4567');

  // International: preserved exactly
  expect(byName('International UK')).toBe('+44 7700 900000');
  expect(byName('International France')).toBe('+33 6 12 34 56 78');
  expect(byName('International Brazil')).toBe('+55 11 91234-5678');

  // UK mobile 11-digit starting 0: NOT treated as +1
  expect(byName('UK mobile 11-digit')).toBe('07700900000');

  // Edge cases unchanged
  expect(byName('Too short')).toBe('12345');
  expect(byName('Too long')).toBe('555123456789012');
});

// ── TC06: Date standardization including ISO 8601 with time ───────
test('TC06: standardizes all date formats including ISO datetime', async ({ page }) => {
  await uploadCSV(page, '06-dates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  const byName = (name: string) => rows.find(r => r.name === name)?.created_date ?? '';

  expect(byName('ISO with time')).toBe('2024-03-15');
  expect(byName('ISO with ms')).toBe('2024-03-15');
  expect(byName('ISO with offset')).toBe('2024-03-15');
  expect(byName('ISO space separator')).toBe('2024-03-15');
  expect(byName('Already YYYY-MM-DD')).toBe('2024-03-15');
  expect(byName('MM/DD/YYYY')).toBe('2024-03-15');
  expect(byName('DD/MM/YYYY unambiguous')).toBe('2024-03-15');
  expect(byName('Month name')).toBe('2024-03-15');
  expect(byName('Mon abbrev')).toBe('2024-03-15');
  expect(byName('DD Mon YYYY')).toBe('2024-03-15');
  expect(byName('YYYY/MM/DD')).toBe('2024-03-15');
  expect(byName('Ambiguous')).toBe('2024-03-05');
  expect(byName('Unrecognized')).toBe('Q1 2024');
  expect(byName('Empty')).toBe('');
});

// ── TC07: Empty row and column removal ───────────────────────────
test('TC07: removes empty rows and empty columns', async ({ page }) => {
  await uploadCSV(page, '07-empty-rows-cols.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(3);
  const headers = Object.keys(rows[0]);
  expect(headers).not.toContain('empty_col');
  expect(headers).toContain('first_name');
  expect(headers).toContain('last_name');
  expect(headers).toContain('email');
});

// ── TC08: dynamicTyping false — leading zeros preserved ───────────
test('TC08: preserves leading zeros (dynamicTyping: false)', async ({ page }) => {
  await uploadCSV(page, '08-dynamic-typing-guard.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows[0].id).toBe('001234');
  expect(rows[0].zip_code).toBe('07601');
  expect(rows[0].account_number).toBe('0098765');
  expect(rows[1].id).toBe('002345');
  expect(rows[1].zip_code).toBe('00501');

  expect(rows[0].id).not.toBe('1234');
  expect(rows[0].zip_code).not.toBe('7601');
});

// ── TC09: UTF-8 BOM and Unicode character preservation ────────────
test('TC09: preserves Unicode characters and includes UTF-8 BOM', async ({ page }) => {
  await uploadCSV(page, '09-unicode-encoding.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  // On iOS the app serves a blob link; on desktop it triggers a download event.
  // Either way we need the raw bytes to verify the UTF-8 BOM.
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

  // First 3 bytes must be UTF-8 BOM: EF BB BF
  expect(rawBytes[0]).toBe(0xEF);
  expect(rawBytes[1]).toBe(0xBB);
  expect(rawBytes[2]).toBe(0xBF);

  const content = Buffer.from(rawBytes).toString('utf-8').slice(1);
  const rows = parseCSV(content);

  expect(rows[0].first_name).toBe('José');
  expect(rows[1].last_name).toBe('Hans');
  expect(rows[1].company).toBe('Büro GmbH');
  expect(rows[2].first_name).toBe('张伟');
  expect(rows[2].company).toBe('北京科技');
});

// ── TC10: HubSpot preset — system column removal + cleaning ───────
test('TC10: HubSpot preset removes system columns and cleans data', async ({ page }) => {
  await uploadCSV(page, '10-hubspot-preset.csv');

  // Open advanced settings
  await page.click('#adv-toggle-row');
  await page.waitForSelector('#advanced-settings', { state: 'visible' });
  await page.selectOption('#crm-preset', 'hubspot');
  await page.click('#clean-settings-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);
  const headers = Object.keys(rows[0]);

  expect(headers).not.toContain('hs_object_id');
  expect(headers).not.toContain('createdate');
  expect(headers).not.toContain('hs_lastmodifieddate');
  expect(headers).not.toContain('hubspot_owner_id');
  expect(headers).toContain('email');
  expect(headers).toContain('first_name');

  expect(rows.length).toBe(2);
  rows.forEach(r => expect(r.email).toBe(r.email.toLowerCase()));

  const johnRow = rows.find(r => r.email === 'john@acme.com');
  expect(johnRow?.phone).toBe('(555) 123-4567');
});

// ── TC11: Already-clean file: -verified suffix, win.html changed=0
test('TC11: already-clean file uses -verified and sends changed=0', async ({ page }) => {
  await uploadCSV(page, '11-already-clean.csv');
  await runQuickClean(page);

  const alreadyCleanMsg = await page.locator('#already-clean-msg').innerText();
  expect(alreadyCleanMsg).toMatch(/looks clean|no changes/i);

  await processAndWaitForDownload(page);

  const summary = await page.locator('#dl-summary').innerText();
  expect(summary).toMatch(/no changes|identical/i);

  const filename = await triggerDownloadGetFilename(page);
  expect(filename).toContain('-verified');
  expect(filename).not.toContain('-cleaned');
  await triggerContinue(page);

  await page.waitForURL(/win\.html/, { timeout: 5000 });
  const params = new URLSearchParams(new URL(page.url()).search);
  expect(params.get('changed')).toBe('0');
  expect(params.get('removed')).toBe('0');
});

// ── TC12: win.html card variant for changed=0 ────────────────────
test('TC12: win.html shows correct card variant for changed=0', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=0&seconds=1&crm=HubSpot&changed=0');
  await page.waitForLoadState('domcontentloaded');

  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).toMatch(/already clean/i);

  const statLabel = await page.locator('#stat-removed-lbl').innerText();
  expect(statLabel).toMatch(/already clean/i);

  const xPost = await page.locator('#x-text').inputValue();
  expect(xPost).toMatch(/verified|clean/i);
  expect(xPost).not.toMatch(/duplicates removed/i);
});

// ── TC13: win.html standard card for changed=1 with removed=0 ────
test('TC13: win.html shows standard card for changed=1 with removed=0', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=0&seconds=1&crm=Salesforce&changed=1');
  await page.waitForLoadState('domcontentloaded');

  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).not.toMatch(/already clean/i);

  const xPost = await page.locator('#x-text').inputValue();
  expect(xPost).not.toMatch(/already clean/i);
});

// ── TC14: State reset between sessions ───────────────────────────
test('TC14: state resets correctly between clean sessions', async ({ page }) => {
  await uploadCSV(page, '13-state-reset.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  const session1Stats = await getStatText(page);
  expect(session1Stats).toMatch(/1/);

  await page.click('#clean-another-btn');
  await page.waitForSelector('#upload-section', { state: 'visible' });

  // Preview section is hidden after cleanAnother — verify it directly
  // (Playwright's innerText() returns content for display:none elements in Chromium)
  await expect(page.locator('#preview-section')).not.toBeVisible();

  await uploadCSV(page, '11-already-clean.csv');
  await runQuickClean(page);

  const alreadyMsg = await page.locator('#already-clean-msg').innerText();
  expect(alreadyMsg).toMatch(/looks clean|no changes/i);

  await processAndWaitForDownload(page);

  const filename = await triggerDownloadGetFilename(page);
  expect(filename).toContain('-verified');
});

// ── TC15: clearTimeout — redirect cancelled by cleanAnother() ─────
test('TC15: cleanAnother cancels win.html redirect setTimeout', async ({ page }) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  // Trigger download (desktop: starts 1-sec redirect timer; iOS: shows save area, no timer).
  await triggerDownload(page);
  // Click clean-another immediately — must fire within the 1-second redirect window
  await page.click('#clean-another-btn');

  // Wait 2 seconds (longer than the 1-second timer)
  await page.waitForTimeout(2000);

  expect(page.url()).toContain('app.html');
  expect(page.url()).not.toContain('win.html');
  await expect(page.locator('#upload-section')).toBeVisible();
});

// ── TC16: Large file processing (10,000 rows) ─────────────────────
test.describe('Large file tests', () => {
  test.beforeAll(async () => {
    const rows: string[] = ['first_name,last_name,email,phone'];

    for (let i = 1; i <= 5000; i++) {
      const email = i <= 200
        ? `USER${i}@EXAMPLE.COM`
        : `user${i}@example.com`;
      rows.push(`User${i},Test${i},${email},555${String(i).padStart(7, '0')}`);
    }
    // 500 duplicate rows (rows 1-500 repeated)
    for (let i = 1; i <= 500; i++) {
      const email = i <= 200
        ? `USER${i}@EXAMPLE.COM`
        : `user${i}@example.com`;
      rows.push(`User${i},Test${i},${email},555${String(i).padStart(7, '0')}`);
    }
    // Fill to 10,000 total
    for (let i = 5001; i <= 9500; i++) {
      rows.push(`User${i},Test${i},user${i}@example.com,555${String(i).padStart(7, '0')}`);
    }

    const fixturePath = path.join(__dirname, '..', 'fixtures', '14-large-file.csv');
    fs.writeFileSync(fixturePath, rows.join('\n'), 'utf-8');
  });

  test('TC16: processes 10,000-row file correctly', async ({ page }) => {
    test.setTimeout(60000);

    await uploadCSV(page, '14-large-file.csv');

    const warning = await page.locator('#msg-file-warn').innerText();
    expect(warning).toMatch(/rows|large/i);

    // Click Quick Clean and check for overlay BEFORE it disappears
    await page.click('#quick-clean-btn');
    // For > 5,000 rows the overlay should appear immediately after the click
    await expect(page.locator('#processing-overlay')).toBeVisible({ timeout: 3000 });

    // Now wait for preview section (overlay hides before this)
    await page.waitForSelector('#preview-section', { state: 'visible', timeout: 55000 });

    await processAndWaitForDownload(page);
    const csv = await downloadCSV(page);
    const rows = parseCSV(csv);

    expect(rows.length).toBe(9500);

    const stats = await getStatText(page);
    expect(stats).toContain('500');
  });
});

// ── TC17: win.html blank state (no URL params) ────────────────────
test('TC17: win.html renders correctly with no URL params', async ({ page }) => {
  await page.goto('/win.html');
  await page.waitForLoadState('domcontentloaded');

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('undefined');
  expect(bodyText).not.toContain('[object Object]');
  expect(bodyText).not.toContain('NaN');

  const statRows = await page.locator('#stat-rows').innerText();
  expect(statRows).toBeTruthy();

  await expect(page.locator('#clean-another-btn')).toBeVisible();
});

// ── TC18: Post on X disabled when textarea is empty ───────────────
test('TC18: Post on X disabled when textarea is empty', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=5&seconds=2&crm=HubSpot&changed=1');
  await page.waitForLoadState('domcontentloaded');

  await page.fill('#x-text', '');
  const postBtn = page.locator('#post-x-btn');
  await expect(postBtn).toBeDisabled();

  await page.fill('#x-text', 'Test post');
  await expect(postBtn).toBeEnabled();
});

// ── TC19: Paste CSV path ──────────────────────────────────────────
test('TC19: paste CSV path cleans and downloads correctly', async ({ page }) => {
  const csvContent = `first_name,last_name,email
John,Smith,JOHN@TEST.COM
Jane,Doe,JANE@TEST.COM
John,Smith,JOHN@TEST.COM`;

  // Use evaluate to show and fill paste area (bypasses CSS display:none on textarea)
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

// ── TC20: aria-live on stats block ───────────────────────────────
test('TC20: stats-block has aria-live attribute', async ({ page }) => {
  const ariaLive = await page.locator('#stats-block').getAttribute('aria-live');
  expect(ariaLive).toBe('polite');

  const ariaAtomic = await page.locator('#stats-block').getAttribute('aria-atomic');
  expect(ariaAtomic).toBe('false');
});

// ── TC21: SRI integrity attributes on CDN scripts ─────────────────
test('TC21: CDN script tags have SRI integrity attributes', async ({ page }) => {
  const papaSrc = await page.locator('script[src*="papaparse"]').getAttribute('integrity');
  expect(papaSrc).toBeTruthy();
  expect(papaSrc).toMatch(/^sha384-/);

  const levSrc = await page.locator('script[src*="levenshtein"]').getAttribute('integrity');
  expect(levSrc).toBeTruthy();
  expect(levSrc).toMatch(/^sha384-/);
  // v2.0.6 — proper UMD browser build (v3.0.0 used require() and never exposed a global)
  expect(levSrc).toBe('sha384-kbcaliuOlQsZ5aNUXD6FYL9vL6AlLdfJoY34DmzX/fHf7O/HaT1cVAYJTFxuCkNx');
});

// ── TC22: Name title casing including Mc and O' edge cases ────────
test("TC22: title cases names including Mc and O' prefixes", async ({ page }) => {
  await uploadCSV(page, '04-name-casing.csv');
  await runQuickClean(page);

  const stats = await getStatText(page);
  expect(stats).toMatch(/names normalized/i);

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  const findRow = (first: string) => rows.find(r => r.first_name === first);

  // All-caps → Title Case
  expect(findRow('John')?.last_name).toBe('Smith');
  expect(findRow('Jane')?.last_name).toBe('Doe');

  // All-lowercase → Title Case
  expect(findRow('Alice')?.last_name).toBe('Brown');

  // Already correct → unchanged
  expect(findRow('Bob')?.last_name).toBe('Jones');

  // Mc prefix edge case
  expect(findRow('Sean')?.last_name).toBe('McDonald');

  // O' prefix edge case
  expect(findRow('Kate')?.last_name).toBe("O'Brien");

  // Email lowercased alongside name casing (Quick Clean default includes lowercase email)
  expect(findRow('John')?.email).toBe('john@acme.com');
});

// ── TC23: Fuzzy deduplication ─────────────────────────────────────
test('TC23: fuzzy dedup identifies and removes near-duplicate rows', async ({ page }) => {
  await uploadCSV(page, '15-fuzzy-dedup.csv');

  // Open advanced settings panel so user can see fuzzy option
  await page.click('#adv-toggle-row');
  await page.waitForSelector('#advanced-settings', { state: 'visible' });
  // Trigger cleaning with fuzzy enabled via evaluate — toggle-switch span intercepts pointer
  // events on the hidden input, and clean-settings-btn does not receive the handler call
  // reliably in headless; calling runCleaning directly is the equivalent UI action
  await page.evaluate(() => {
    const cb = document.getElementById('t-fuzzy') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    (window as any).runCleaning((window as any).getSettings());
  });

  // Fuzzy confirm UI appears with the matched pair
  await page.waitForSelector('#fuzzy-confirm-area', { state: 'visible', timeout: 10000 });
  const scoreText = await page.locator('#fuzzy-pairs-list').innerText();
  expect(scoreText).toMatch(/\d+% match/);

  // Confirm removal — checkboxes are checked by default → removes second of each pair
  await page.click('#fuzzy-confirm-btn');
  await expect(page.locator('#fuzzy-confirm-area')).not.toBeVisible();

  const stats = await getStatText(page);
  expect(stats).toMatch(/duplicates removed/i);

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);
  expect(rows.find(r => r.first_name === 'John' && r.last_name === 'Smith')).toBeTruthy();
  expect(rows.find(r => r.first_name === 'Jon'  && r.last_name === 'Smith')).toBeUndefined();
  expect(rows.find(r => r.first_name === 'Jane' && r.last_name === 'Doe')).toBeTruthy();
});

// ── TC24: XLSX download ───────────────────────────────────────────
test('TC24: XLSX download produces valid Excel file', async ({ page }) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  // XLSX button hidden until toggle is checked
  await expect(page.locator('#dl-xlsx-btn')).not.toBeVisible();

  // Toggle switch <span> intercepts pointer events — set via evaluate
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

  const filename = download.suggestedFilename();
  expect(filename).toContain('-cleaned');
  expect(filename).toMatch(/\.xlsx$/i);

  const filePath = await download.path();
  const bytes = fs.readFileSync(filePath!);
  expect(bytes.length).toBeGreaterThan(0);

  // Valid XLSX is a ZIP archive — starts with PK\x03\x04
  expect(bytes[0]).toBe(0x50); // 'P'
  expect(bytes[1]).toBe(0x4B); // 'K'
  expect(bytes[2]).toBe(0x03);
  expect(bytes[3]).toBe(0x04);
});

// ── TC25: win.html shows correct removed count after real dedup ───
test('TC25: win.html shows correct removed count after real dedup', async ({ page }) => {
  await uploadCSV(page, '01-exact-duplicates.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);

  await triggerDownload(page);
  await triggerContinue(page);

  await page.waitForURL(/win\.html/, { timeout: 5000 });
  const params = new URLSearchParams(new URL(page.url()).search);

  expect(params.get('changed')).toBe('1');
  expect(params.get('removed')).toBe('2');
  expect(params.get('rows')).toBe('4');

  await page.waitForLoadState('domcontentloaded');

  // Stat block shows numeric removed count
  const statRemoved = await page.locator('#stat-removed').innerText();
  expect(statRemoved).toBe('2');

  // Card shows same count, not "already clean" label
  const cardRemoved = await page.locator('#card-removed').innerText();
  expect(cardRemoved).toBe('2');

  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).not.toMatch(/already clean/i);
});

// ── TC26: CSV with quoted commas preserved end-to-end ────────────
test('TC26: fields with embedded commas survive cleaning intact', async ({ page }) => {
  await uploadCSV(page, '16-quoted-commas.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);

  // Embedded commas in last_name and company must survive
  const john = rows.find(r => r.first_name === 'John');
  expect(john?.last_name).toBe('Smith, Jr.');
  expect(john?.company).toBe('Acme, Inc.');

  // Email also lowercased by Quick Clean defaults
  expect(john?.email).toBe('john@acme.com');

  const jane = rows.find(r => r.first_name === 'Jane');
  expect(jane?.last_name).toBe('Doe');
  expect(jane?.company).toBe('Beta Inc');
});

// ── TC27: Tool is locked without a payment token ──────────────────
test.describe('Access control', () => {
  test('TC27: tool is locked without a valid order token', async ({ browser }) => {
    // Fresh context — no init script injected, no localStorage token
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      await pg.goto('http://localhost:4321/app.html');
      await pg.waitForLoadState('domcontentloaded');

      // Locked view visible, tool view hidden
      await expect(pg.locator('#locked-view')).toBeVisible();
      await expect(pg.locator('#tool-view')).not.toBeVisible();

      // Payment CTA is present
      await expect(pg.locator('#locked-cta')).toBeVisible();

      // Clean button is not reachable
      await expect(pg.locator('#quick-clean-btn')).not.toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

// ── TC28: Email dedup is case-insensitive ─────────────────────────
test('TC28: email dedup removes case-insensitive duplicates', async ({ page }) => {
  // Fixture has 5 rows: JOHN@ACME.COM + john@acme.com (dup), JANE@ACME.COM + jane@acme.com (dup), bob@acme.com
  await uploadCSV(page, '17-email-dedup-case.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  // 2 case-insensitive duplicates removed → 3 rows remain
  expect(rows.length).toBe(3);

  // Duplicate suffixed rows must be gone
  expect(rows.find(r => r.last_name === 'Smith-Duplicate')).toBeUndefined();
  expect(rows.find(r => r.last_name === 'Doe-Duplicate')).toBeUndefined();

  // First occurrences kept; lowercaseEmail applied by Quick Clean
  expect(rows.find(r => r.last_name === 'Smith')?.email).toBe('john@acme.com');
  expect(rows.find(r => r.last_name === 'Doe')?.email).toBe('jane@acme.com');
  expect(rows.find(r => r.last_name === 'Jones')?.email).toBe('bob@acme.com');
});

// ── TC29: Salesforce preset applies correct transformations ───────
test('TC29: Salesforce preset title-cases names and preserves email case', async ({ page }) => {
  await uploadCSV(page, '18-salesforce-preset.csv');

  // Open advanced settings panel (hidden by default)
  await page.click('#adv-toggle-row');
  await page.waitForSelector('#advanced-settings', { state: 'visible' });

  // Selecting the preset triggers applyPreset() via change event
  await page.selectOption('#crm-preset', 'salesforce');

  // Click "Clean with settings"
  await page.click('#clean-settings-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });

  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);

  const john = rows.find(r => r.first_name === 'John');
  expect(john).toBeTruthy();
  expect(john?.last_name).toBe('Smith');
  // Salesforce preset: lowercaseEmail: false — email case preserved
  expect(john?.email).toBe('JOHN@ACME.COM');
  // Phone formatted: 5551234567 → (555) 123-4567
  expect(john?.phone).toBe('(555) 123-4567');

  const jane = rows.find(r => r.first_name === 'Jane');
  expect(jane).toBeTruthy();
  expect(jane?.last_name).toBe('Doe');
  expect(jane?.email).toBe('JANE@ACME.COM');
  expect(jane?.phone).toBe('(555) 987-6543');
});

// ── TC30: Duplicate column headers removed ────────────────────────
test('TC30: duplicate column headers are deduplicated', async ({ page }) => {
  // Fixture has two `email` columns; Quick Clean removes the second
  await uploadCSV(page, '19-dup-headers.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);

  // Only one email column in output — parseCSV header set has no duplicate
  const headers = Object.keys(rows[0]);
  const emailCols = headers.filter(h => h.toLowerCase() === 'email');
  expect(emailCols.length).toBe(1);

  // Kept first email column values, not the dupe column
  expect(rows.find(r => r.first_name === 'John')?.email).toBe('john@acme.com');
  expect(rows.find(r => r.first_name === 'Jane')?.email).toBe('jane@acme.com');
});

// ── TC32: Trim leading/trailing whitespace from field values ──────
test('TC32: leading and trailing whitespace trimmed from fields', async ({ page }) => {
  await uploadCSV(page, '20-trim-whitespace.csv');
  await runQuickClean(page);
  await processAndWaitForDownload(page);
  const csv = await downloadCSV(page);
  const rows = parseCSV(csv);

  expect(rows.length).toBe(2);

  const john = rows.find(r => r.first_name === 'John');
  expect(john?.first_name).toBe('John');
  expect(john?.last_name).toBe('Smith');
  expect(john?.email).toBe('john@acme.com');
  expect(john?.company).toBe('Acme Corp');

  const jane = rows.find(r => r.first_name === 'Jane');
  expect(jane?.last_name).toBe('Doe');
  expect(jane?.email).toBe('jane@beta.com');
  expect(jane?.company).toBe('Beta Inc');
});

// ── TC31: URL ?order_number param unlocks the tool ───────────────
test.describe('URL unlock', () => {
  test('TC31: ?order_number in URL unlocks tool and stores token', async ({ browser }) => {
    // Fresh context — no init script, no pre-existing localStorage
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    try {
      await pg.goto('http://localhost:4321/app.html?order_number=TEST-URL-123');
      await pg.waitForLoadState('domcontentloaded');

      // Tool should be unlocked by the URL param
      await expect(pg.locator('#tool-view')).toBeVisible();
      await expect(pg.locator('#locked-view')).not.toBeVisible();

      // Token persisted to localStorage for future visits
      const stored = await pg.evaluate(() =>
        localStorage.getItem('cleanlist_v1_order_id')
      );
      expect(stored).toBe('TEST-URL-123');
    } finally {
      await ctx.close();
    }
  });
});
