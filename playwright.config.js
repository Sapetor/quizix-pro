// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/* Override with PW_PORT when 3000 is taken by another local service —
 * reuseExistingServer would otherwise silently test the wrong app. */
const PORT = process.env.PW_PORT || 3000;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  /* Playwright specs only — Jest owns *.test.js (unit/ and stress/) */
  testMatch: '**/*.spec.js',
  /* Ignore Jest unit tests */
  testIgnore: ['**/unit/**'],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* CI: serial. Local: capped — the game-flow specs run a live host+player
   * against the same machine's server, and unbounded workers' screenshot
   * bursts starve the host page long enough to miss Socket.IO pings, which
   * drops the host mid-game ("Host disconnected" flakes). */
  workers: process.env.CI ? 1 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${PORT}`,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'Mobile Chrome',
      use: { ...devices['Galaxy S8'] },
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});