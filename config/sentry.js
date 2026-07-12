import * as Sentry from "@sentry/node";
import { env } from "./validateEnv.js";

export function initSentry() {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1.0,
    // Ignore noise
    ignoreErrors: [
      "Not allowed by CORS",
      "Too many requests",
    ],
  });

  // logger not imported here to avoid circular dep — plain console is fine
  console.log("[sentry] Initialized with DSN");
}

export { Sentry };
