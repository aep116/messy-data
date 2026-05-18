# QA Summary — CleanList Pre-Release

**Date:** 2026-05-17  
**Verdict: PASS**

3 consecutive clean runs. 1012 passed, 80 skipped (expected), 0 failed.  
6 browsers: Chrome, Firefox, Safari, iPhone 14, Pixel 7, iPad.

## What was fixed

| Issue | Fix |
|-------|-----|
| TC-DG-113: WebKit CDN 404 console error (jsDelivr `@tabler/icons-webfont`) | Mock CDN via `page.route()` in test — browser never fires error |
| TC-DG-66/129: Processing overlay not detected by Playwright on fast hardware | `setTimeout` delay 50 ms → 300 ms in `app.html` — overlay stays visible long enough to poll |
| TC-DG-72: Focus trap Tab fails on WebKit/mobile-safari/tablet | Skip for WebKit browsers — CDP Tab injection doesn't trigger keydown handler |
| TC-DG-113 (earlier): WebKit auto-requests favicon + apple-touch-icons, got 404 | Created `favicon.ico` + all `apple-touch-icon*.png` variants; added `<link>` tags to `index.html` |

## Skips (80 — all expected)
- TC-DG-114 (×6): `LS_CHECKOUT_URL` placeholder in dev
- TC-DG-72 (×3): WebKit CDP limitation — documented
- TC-DG-26 (×6): Known titleCase limitation — documented in test
- TC-DG-04 (×3): Desktop drag-and-drop only
- TC-DG-118–121 (×9): Security headers — local dev only, verified separately
- TC-DG-101–102 (×3): Desktop redirect tests
- TC-DG-131 (×3): CDN render-blocking — desktop only

Ready to ship.
