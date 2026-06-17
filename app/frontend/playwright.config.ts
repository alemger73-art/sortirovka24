import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the auth flows (registration, login, logout).
 *
 * Both servers are started automatically (and reused if already running):
 *  - Backend (FastAPI) on :8000 with DEBUG=1, so the SMS code is returned and
 *    auto-filled by the UI. Launched from ../backend via the local uv venv
 *    (`.venv`); override with E2E_BACKEND_CMD if your interpreter differs.
 *  - Frontend (Vite) on :3000, proxying /api → :8000.
 */
const backendCmd =
  process.env.E2E_BACKEND_CMD ||
  ".venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Use the system-installed Chrome/Edge via channel, so no browser binary
      // download is required. Override with E2E_BROWSER_CHANNEL if needed.
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL || "chrome" },
    },
  ],
  webServer: [
    {
      command: backendCmd,
      cwd: "../backend",
      url: "http://localhost:8000/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { DEBUG: "1", ENVIRONMENT: "dev", SMS_EXPOSE_CODE: "1", DATABASE_URL: "" },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_PORT: "3000", BACKEND_PORT: "8000" },
    },
  ],
});
