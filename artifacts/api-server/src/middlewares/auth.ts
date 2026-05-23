import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

/**
 * Middleware to require a valid admin secret in the x-admin-secret header.
 * Uses a timing-safe comparison to prevent timing attacks.
 * Fails closed if ADMIN_SECRET is not set in the environment.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    console.error("[AUTH] ADMIN_SECRET not set in environment. Admin access is disabled.");
    return res.status(403).json({
      error: "forbidden",
      message: "Admin API is not configured.",
    });
  }

  const provided = req.headers["x-admin-secret"];

  if (typeof provided !== "string") {
    console.warn(`[AUTH] Unauthorized admin access attempt (missing/invalid header) from IP: ${req.ip}`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Use timingSafeEqual to prevent timing attacks.
  // Both inputs must be of equal length. Hashing both to SHA-256 ensures this.
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();

  try {
    if (crypto.timingSafeEqual(secretHash, providedHash)) {
      return next();
    }
  } catch (err) {
    // Should not happen with fixed-length hashes, but good for safety
    console.error("[AUTH] Error during secret comparison:", err);
  }

  console.warn(`[AUTH] Unauthorized admin access attempt (invalid secret) from IP: ${req.ip}`);
  return res.status(401).json({ error: "Unauthorized" });
}
