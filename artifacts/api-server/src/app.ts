import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app: Express = express();

// ── CORS ───────────────────────────────────────────────────────────────────
// Lock down to ALLOWED_ORIGIN in production.  Falls back to permissive in dev
// so the Vite dev-server preview keeps working without extra config.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors(
    allowedOrigin
      ? {
          origin: allowedOrigin,
          credentials: true,
        }
      : undefined, // undefined → default permissive (dev only)
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
