import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const edge =
  process.platform === "win32" &&
  existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
// Optional separate loopback port for safe tests while the developer's Vite is running.
const testOrigin = new URL(
  process.env.NATIQ_WEB_TEST_ORIGIN || "http://localhost:5173",
);
if (
  testOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(testOrigin.hostname) ||
  testOrigin.pathname !== "/" ||
  testOrigin.username ||
  testOrigin.password ||
  testOrigin.search ||
  testOrigin.hash
) {
  throw new Error("NATIQ_WEB_TEST_ORIGIN must be a loopback HTTP origin");
}
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: testOrigin.origin,
    browserName: "chromium",
    ...(edge ? { channel: "msedge" } : {}),
    headless: true,
    trace: "off",
  },
  webServer: {
    command: `npm.cmd run dev -- --host ${testOrigin.hostname} --port ${testOrigin.port || "80"}`,
    url: testOrigin.origin,
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL:
        process.env.NATIQ_WEB_REAL_API === "YES"
          ? "http://localhost:3100"
          : "http://localhost:3000",
    },
  },
});
