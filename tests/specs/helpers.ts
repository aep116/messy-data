import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Inject a fake localStorage token to simulate a paid user.
// Call this before navigating to app.html to bypass the locked state.
export async function unlockTool(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cleanlist_v1_order_id', 'TEST-ORDER-123');
    localStorage.setItem('cleanlist_cookie_dismissed', 'true');
  });
}

// Upload a CSV file to app.html via the file input.
// Returns after processCSVText() has completed (file-info visible).
export async function uploadCSV(page: Page, fixtureName: string) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', fixtureName);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('#file-info', { state: 'visible' });
}

// Click Quick Clean and wait for preview to render.
export async function runQuickClean(page: Page) {
  await page.click('#quick-clean-btn');
  await page.waitForSelector('#preview-section', { state: 'visible' });
}

// Click Process full file and wait for download section.
export async function processAndWaitForDownload(page: Page) {
  await page.click('#process-btn');
  await page.waitForSelector('#download-section', { state: 'visible' });
}

// Download the cleaned CSV and return its text content (BOM stripped).
export async function downloadCSV(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dl-csv-btn'),
  ]);
  const filePath = await download.path();
  const content = fs.readFileSync(filePath!, 'utf-8');
  // Strip UTF-8 BOM if present
  return content.startsWith('﻿') ? content.slice(1) : content;
}

// Parse CSV text into array of row objects (simple, no quoted-comma support).
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] !== undefined ? values[i] : ''; });
    return row;
  });
}

// Get the text content of the stats block.
export async function getStatText(page: Page): Promise<string> {
  return await page.locator('#stats-block').innerText();
}
