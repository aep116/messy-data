import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
  },
  webServer: {
    command: 'npx serve .. -l 4321',
    url: 'http://localhost:4321/app.html',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
