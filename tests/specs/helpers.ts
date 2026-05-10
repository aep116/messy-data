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

// Split one CSV line into fields, handling RFC 4180 quoted fields with embedded commas.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let field = '';
      while (i < line.length) {
        if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
          field += '"'; i += 2;
        } else if (line[i] === '"') {
          i++; break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  if (line.endsWith(',')) fields.push('');
  return fields;
}

// Parse CSV text into array of row objects (handles quoted fields with embedded commas).
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

// Get the text content of the stats block.
export async function getStatText(page: Page): Promise<string> {
  return await page.locator('#stats-block').innerText();
}
