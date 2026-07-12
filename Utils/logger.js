// Utils/logger.js
//
// Tiny structured logger. In production each line is JSON (easy to parse in
// log aggregators like Datadog, Logtail, etc.). In development it's human-
// readable coloured output. Drop this anywhere instead of console.log/error.
//
// Usage:
//   import logger from '../Utils/logger.js';
//   logger.info('User registered', { userId });
//   logger.error('Payment failed', { orderId, err });
//

import { env } from "../config/validateEnv.js";

const IS_PROD = env.NODE_ENV === "production";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLOURS = { debug: "\x1b[36m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

function log(level, message, meta = {}) {
  if (IS_PROD) {
    // JSON — one line, easy for log aggregators
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...flattenMeta(meta),
    };
    const out = level === "error" ? console.error : console.log;
    out(JSON.stringify(entry));
  } else {
    const colour = COLOURS[level] || "";
    const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
    const prefix = `${colour}[${level.toUpperCase().padEnd(5)}]${RESET} ${ts}`;
    const metaStr = Object.keys(meta).length
      ? " " + JSON.stringify(meta, null, 0)
      : "";
    const out = level === "error" ? console.error : console.log;
    out(`${prefix} ${message}${metaStr}`);
  }
}

// Flatten Error objects so they serialise properly
function flattenMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v instanceof Error) {
      out[k] = { message: v.message, stack: v.stack, name: v.name };
    } else {
      out[k] = v;
    }
  }
  return out;
}

const logger = {
  debug: (msg, meta) => LEVELS.debug >= 0 && log("debug", msg, meta),
  info:  (msg, meta) => log("info",  msg, meta),
  warn:  (msg, meta) => log("warn",  msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};

export default logger;
