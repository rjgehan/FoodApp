import { defineConfig } from '@playwright/test';

/**
 * Runs against the local dev stack (`./dev.sh start`), never production: the suite creates
 * households and accounts, and some tests deliberately trip the PIN lockout.
 *
 * The browser is the Chrome already installed on this Mac (`channel: 'chrome'`), so there is no
 * Playwright browser download. The iPhone project also tells Chrome it has no hover and a coarse
 * pointer — without that, anything the app hides behind `@media (hover: hover)` shows up in
 * screenshots even though a real phone never draws it.
 */
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

const iphone = {
  baseURL: WEB_URL,
  channel: 'chrome',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  launchOptions: {
    args: ['--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2'],
  },
};

export default defineConfig({
  testDir: './tests',
  // Tests share one database; each makes its own household, but the PIN lockout is per account
  // and the landing page is global, so keep it simple and serial.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './lib/global-setup.ts',
  use: {
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /api\/.*\.spec\.ts/ },
    { name: 'iphone', testMatch: /ui\/.*\.spec\.ts/, use: iphone },
    { name: 'screens', testMatch: /screens\/.*\.spec\.ts/, use: iphone, timeout: 180_000 },
  ],
});
