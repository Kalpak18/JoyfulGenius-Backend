// config/validateEnv.js
import dotenv from "dotenv";
import { cleanEnv, str, url, num, makeValidator } from 'envalid';

dotenv.config();

const mongoUri = makeValidator(x => {
  if (!/^mongodb(\+srv)?:\/\//.test(x)) throw new Error('Invalid Mongo URI');
  return x;
});

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  PORT:            num({ default: 4001 }),
  FRONTEND_URL:    url(),

  MONGO_URI:       mongoUri(),

  JWT_SECRET:         str(),
  JWT_REFRESH_SECRET: str(),

  // Gmail (used for OTP + reset emails + payment receipts)
  EMAIL_USER:      str(),
  EMAIL_PASS:      str(),

  // Razorpay
  RAZORPAY_KEY_ID:         str({ default: "" }),
  RAZORPAY_KEY_SECRET:     str({ default: "" }),
  RAZORPAY_WEBHOOK_SECRET: str({ default: "" }),

  // AWS S3 — used for direct-to-S3 lecture video + thumbnail + course banner uploads.
  // All four are required to enable uploads; absent → server returns 503 on upload routes.
  AWS_REGION:            str({ default: "ap-south-1" }),
  AWS_ACCESS_KEY_ID:     str({ default: "" }),
  AWS_SECRET_ACCESS_KEY: str({ default: "" }),
  AWS_S3_BUCKET:         str({ default: "" }),
  // Optional CDN — if set, file URLs are returned through this hostname instead of s3.amazonaws.com
  AWS_S3_PUBLIC_BASE:    str({ default: "" }),

  // Sentry — optional; if not set, Sentry is disabled
  SENTRY_DSN: str({ default: "" }),

  // Email provider — smtp (default/gmail), resend, sendgrid
  EMAIL_PROVIDER: str({ choices: ["smtp", "resend", "sendgrid"], default: "smtp" }),
  RESEND_API_KEY: str({ default: "" }),
  SENDGRID_API_KEY: str({ default: "" }),

  // Diagnostics — token required to hit /health/full in production
  HEALTH_TOKEN: str({ default: "" }),
});
