import { Router, type IRouter } from "express";
import { execSync } from "child_process";

const router: IRouter = Router();

// Resolve once at boot so we don't shell out on every request.
function resolveBuildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

const BUILD_ID = resolveBuildId();
const BOOT_TIME = new Date().toISOString();
const BUILD_TIME = process.env.BUILD_TIME ?? BOOT_TIME;

/**
 * GET /api/version
 *
 * Returns the running backend's build identity. Used by:
 *   - the wallet's Settings → About screen
 *   - cross-agent debugging (paste this in bug reports so both AI
 *     builders agree on which deploy the user is running)
 *   - uptime/version probes
 */
router.get("/version", (_req, res) => {
  res.json({
    buildId: BUILD_ID,
    buildTime: BUILD_TIME,
    bootTime: BOOT_TIME,
    service: "gasless-api",
  });
});

export default router;
