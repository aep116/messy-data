import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 45000,
  workers: 1,
  use: { baseURL: 'http://localhost:4321', headless: true },
  projects: [
    { name: 'chromium',      use: { ...devices['Desktop Chrome']  } },
    { name: 'firefox',       use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',        use: { ...devices['Desktop Safari']  } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14']       } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7']         } },
    { name: 'tablet',        use: { ...devices['iPad (gen 7)']    } },
  ],
  webServer: {
    command: 'npx serve .. -l 4321',
    url: 'http://localhost:4321/app.html',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
