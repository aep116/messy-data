import { test, expect } from '@playwright/test';

// TC-DG-103 — win.html: stat-rows shows correct value
test('TC-DG-103: win.html stat-rows shows correct row count', async ({ page }) => {
  await page.goto('/win.html?rows=150&removed=10&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const statRows = await page.locator('#stat-rows').innerText();
  expect(statRows).toMatch(/150/);
});

// TC-DG-104 — win.html: stat-removed shows correct value
test('TC-DG-104: win.html stat-removed shows correct removed count', async ({ page }) => {
  await page.goto('/win.html?rows=150&removed=10&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const statRemoved = await page.locator('#stat-removed').innerText();
  expect(statRemoved).toMatch(/10/);
});

// TC-DG-105 — win.html: stat-seconds shows correct value
test('TC-DG-105: win.html stat-seconds shows correct processing time', async ({ page }) => {
  await page.goto('/win.html?rows=150&removed=10&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const statSeconds = await page.locator('#stat-time').innerText();
  expect(statSeconds).toMatch(/2/);
});

// TC-DG-106 — win.html: changed=1 shows standard card (not already-clean)
test('TC-DG-106: win.html changed=1 shows standard success card, not already-clean card', async ({ page }) => {
  await page.goto('/win.html?rows=150&removed=10&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).not.toMatch(/already clean/i);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/already clean/i);
});

// TC-DG-107 — win.html: changed=0 shows already-clean card
test('TC-DG-107: win.html changed=0 shows already-clean card', async ({ page }) => {
  await page.goto('/win.html?rows=50&removed=0&seconds=1&crm=CSV&changed=0');
  await page.waitForLoadState('domcontentloaded');
  const cardLabel = await page.locator('#card-removed-lbl').innerText();
  expect(cardLabel).toMatch(/already clean/i);
});

// TC-DG-108 — win.html: no URL params shows no undefined or NaN
test('TC-DG-108: win.html without URL params shows no undefined, NaN, or object literals', async ({ page }) => {
  await page.goto('/win.html');
  await page.waitForLoadState('domcontentloaded');
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('undefined');
  expect(bodyText).not.toContain('NaN');
  expect(bodyText).not.toContain('[object Object]');
});

// TC-DG-109 — win.html: X post button enabled when text present
test('TC-DG-109: X post button is enabled when textarea has text', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=5&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const postBtn = page.locator('#post-x-btn');
  const xText = await page.locator('#x-text').inputValue();
  if (xText.trim().length > 0) {
    await expect(postBtn).toBeEnabled();
  }
});

// TC-DG-110 — win.html: X post button disabled when textarea cleared
test('TC-DG-110: X post button is disabled when post textarea is cleared', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=5&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('#x-text', '');
  // Trigger input event to update button state
  await page.locator('#x-text').dispatchEvent('input');
  const postBtn = page.locator('#post-x-btn');
  await expect(postBtn).toBeDisabled();
});

// TC-DG-111 — win.html: Clean Another button navigates to app.html
test('TC-DG-111: Clean Another button on win.html navigates back to app.html', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=5&seconds=2&crm=CSV&changed=1');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#clean-another-btn')).toBeVisible();
  await page.click('#clean-another-btn');
  await page.waitForURL(/app\.html/);
  expect(page.url()).toContain('app.html');
});

// TC-DG-112 — win.html: crm param appears in page display
test('TC-DG-112: win.html crm param value appears in page content', async ({ page }) => {
  await page.goto('/win.html?rows=100&removed=5&seconds=2&crm=HubSpot&changed=1');
  await page.waitForLoadState('domcontentloaded');
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).toContain('HubSpot');
});
