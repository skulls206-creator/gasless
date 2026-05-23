import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app: Express = express();

// Enable "trust proxy" so express-rate-limit sees the correct client IP
// when running behind Replit's proxy or other load balancers.
app.set("trust proxy", 1);

// ── CORS ───────────────────────────────────────────────────────────────────
// Production split: the API runs on Replit, the frontend ships to GitHub
// Pages at gasless.khurk.xyz. We allowlist by exact origin match.
//
// Config:
//   ALLOWED_ORIGINS  comma-separated list (preferred)
//   ALLOWED_ORIGIN   single origin (back-compat with prior config)
//
// Fail-closed in production: if the allowlist is empty and NODE_ENV is
// production, refuse all cross-origin requests. Permissive fallback is
// gated to non-production (local dev only).
const allowlistRaw =
  process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "";
const allowlist = allowlistRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";

if (isProd && allowlist.length === 0) {
  // Loud warning at boot — don't silently serve "*" in prod.
  // eslint-disable-next-line no-console
  console.warn(
    "[CORS] NODE_ENV=production but ALLOWED_ORIGINS is empty — " +
      "all cross-origin requests will be rejected. Set ALLOWED_ORIGINS " +
      "(e.g. https://gasless.khurk.xyz) to permit the frontend.",
  );
}

app.use(
  cors(
    allowlist.length
      ? {
          origin(origin, cb) {
            // Same-origin / curl / health probes have no Origin header.
            if (!origin) return cb(null, true);
            if (allowlist.includes(origin)) return cb(null, true);
            cb(new Error(`CORS: origin ${origin} not in allowlist`));
          },
          credentials: true,
        }
      : isProd
        ? {
            // Fail-closed: reject all cross-origin in prod when unconfigured.
            origin(origin, cb) {
              if (!origin) return cb(null, true);
              cb(new Error("CORS: ALLOWED_ORIGINS not configured"));
            },
          }
        : undefined, // permissive — local dev only
  ),
);

app.use(express.json({ limit: "64kb" })); // reject oversized payloads
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// ── Rate limiters ──────────────────────────────────────────────────────────

// Gasless-send: expensive (energy delegation + broadcast) → 8 per 5 min per IP
const sendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many send requests — please wait a few minutes." },
});

// General API: proxy calls, balance checks, etc. → 120 per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

app.use("/api/gasless-send", sendLimiter);
app.use("/api", generalLimiter);
app.use("/api", router);

export default app;
