import dotenv from 'dotenv';
dotenv.config();

import { initSentry, Sentry } from './config/sentry.js';
initSentry(); // must be called before any other imports that might throw

import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from "cookie-parser";
import morgan from 'morgan';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { fileURLToPath } from "url";
import mongoose from 'mongoose';

// security sanitizers
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';

import connectDB from './config/db.js';
import { initGridFS } from './config/gridfs.js';
import { env } from './config/validateEnv.js';

import userRoutes from './routes/UserRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import developerRoutes from './routes/DeveloperRoutes.js';
import authRoutes from "./routes/authRoutes.js";
import testResultRoutes from './routes/testResultRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testRoutes from './routes/testRoutes.js';
import studyMaterialRoutes from "./routes/StudyMaterialRoutes.js";
import chapterRoutes from "./routes/chapterRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { studentRouter as lectureStudentRoutes, adminRouter as lectureAdminRoutes } from "./routes/lectureRoutes.js";
import { studentRouter as assignmentStudentRoutes, adminRouter as assignmentAdminRoutes } from "./routes/assignmentRoutes.js";
import testBundleRoutes from "./routes/testBundleRoutes.js";
import errorHandler from './middleware/errorHandler.js';

const { NODE_ENV, FRONTEND_URL, PORT } = env;
const PROD_DOMAIN = FRONTEND_URL?.trim().replace(/^https?:\/\//, '');

// Surface monitoring/payment misconfig loudly in production so it can't ship silently broken.
if (NODE_ENV === 'production') {
  if (!env.SENTRY_DSN) console.warn('[startup] SENTRY_DSN not set — error monitoring is DISABLED in production.');
  if (!env.RAZORPAY_WEBHOOK_SECRET) console.warn('[startup] RAZORPAY_WEBHOOK_SECRET not set — webhook signature verification will reject all events.');
  if (String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')) console.warn('[startup] Razorpay is still in TEST mode (rzp_test_*). Real customers will not be charged.');
}

connectDB();
const app = express();

// trust proxy (for secure cookies and rate-limiters when behind load balancer)
if (NODE_ENV === "production") {
  app.set('trust proxy', 1);
}

// disable x-powered-by
app.disable('x-powered-by');

// ------------------- SENTRY REQUEST HANDLER -------------------
// Must be first middleware before routes
if (Sentry?.Handlers?.requestHandler) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// ------------------- LOGGING -------------------
const logDirectory = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory, { recursive: true });

const accessLogStream = createStream('access.log', { interval: '1d', path: logDirectory });
const securityLogStream = createStream('security.log', { interval: '1d', maxFiles: 7, path: logDirectory });
const alertsLogStream = createStream('alerts.log', { interval: '1d', maxFiles: 7, path: logDirectory });

// write combined log to file; in dev also show human logs in console
app.use(morgan('combined', { stream: accessLogStream }));
if (NODE_ENV !== 'production') app.use(morgan('dev'));

// ------------------- SECURITY MIDDLEWARES -------------------
// Build CSP directives safely
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'"],
};
if (PROD_DOMAIN) {
  // allow your frontend origin for scripts/connect (if your frontend serves inline scripts or CDN)
  cspDirectives.scriptSrc.push(`https://${PROD_DOMAIN}`);
  cspDirectives.connectSrc.push(`https://${PROD_DOMAIN}`);
}

if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: cspDirectives
    },
    crossOriginResourcePolicy: { policy: "same-origin" }
  }));
  // enable HSTS if you terminate TLS here (or ensure proxy provides HTTPS)
  app.use(helmet.hsts({ maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }));
} else {
  // easier dev policy — avoid breaking dev flow
  app.use(helmet({ contentSecurityPolicy: false }));
}

app.use(helmet.referrerPolicy({ policy: "no-referrer" }));
app.use(compression());
app.use(cookieParser());

// ------------------- SANITIZATION -------------------
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// ------------------- CORS -------------------
const corsDelegate = (req, callback) => {
  const origin = req.header("Origin");
  // allow non-browser requests (curl, server-to-server)
  if (!origin) return callback(null, {
    origin: true,
    credentials: true,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
  });

  // dev localhosts
  if (
    NODE_ENV !== "production" &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))
  ) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
      allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
    });
  }

  // production: allow exact origins and subdomains of PROD_DOMAIN
  if (PROD_DOMAIN) {
    const allowed = [
      `https://${PROD_DOMAIN}`,
      `https://www.${PROD_DOMAIN}`,
    ];
    // allow exact match or subdomain (must include a dot before domain)
    if (allowed.includes(origin) || origin.endsWith(`.${PROD_DOMAIN}`)) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
        allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
      });
    }
  }

  // log and block
  const logEntry = `[${new Date().toISOString()}] CORS_BLOCKED: ${origin} - IP ${req.ip}\n`;
  securityLogStream.write(logEntry);
  alertsLogStream.write(logEntry);
  return callback(new Error("Not allowed by CORS"), { origin: false });
};

app.use(cors(corsDelegate));
app.options("*", cors(corsDelegate)); // handle preflights

// ------------------- RATE LIMITING -------------------
// Prod: 200 req / 15 min per IP. Dev: 5000 so debugging doesn't get blocked.
// Public read endpoints (course catalog, health) skip the counter entirely
// so a React re-render loop can't lock the whole app out.
const GLOBAL_SKIP = [
  "/api/courses/public",
  "/api/subjects/grouped",
  "/health",
  "/health/full",
  "/api/docs",
  "/api/docs.json",
];
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === "production" ? 200 : 5000,
  skip: (req) => GLOBAL_SKIP.some((p) => req.originalUrl.startsWith(p)),
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_GLOBAL: ${req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    alertsLogStream.write(logEntry);
    res.status(429).json({ message: "Too many requests. Please try again later." });
  }
});
app.use(globalLimiter);

// Auth rate limit — stricter in production, relaxed in dev so debugging
// doesn't get blocked. Bump max to 50/5min locally.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: NODE_ENV === "production" ? 5 : 50,
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_AUTH: ${req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    alertsLogStream.write(logEntry);
    res.status(429).json({ message: "Too many login/OTP attempts. Try again later." });
  }
});
// Apply to auth and admin login endpoints
app.use(['/api/auth/login', '/api/users/login', '/api/users/forgot-password', '/api/admin/login', '/api/admin/forgot-password', '/api/developer/login', '/api/developer/register'], authLimiter);

// Tighter limit for payment-creating endpoints (defense-in-depth on top of Razorpay's own throttling).
// Webhook is mounted with raw body BEFORE app.use(express.json) and is excluded here on purpose —
// Razorpay retries webhooks aggressively and we don't want to 429 them.
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_PAYMENT: ${req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    alertsLogStream.write(logEntry);
    res.status(429).json({ message: "Too many payment requests. Please wait a minute and try again." });
  }
});
app.use(['/api/payments/order', '/api/payments/verify'], paymentLimiter);

// Per-user assignment-submit throttle — prevents accidental rapid-fire double-submits.
const assignmentSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_ASSIGNMENT_SUBMIT: ${req.user?.id || req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    res.status(429).json({ message: "Too many submissions in a short time. Please wait a minute." });
  }
});
app.use('/api/assignments/:id/submit', assignmentSubmitLimiter);

// ------------------- BODY PARSERS -------------------
// Razorpay webhook must be mounted BEFORE express.json so we can verify the
// raw body signature. We mount it with express.raw on that specific path.
import { verifyWebhookSignature, handleWebhook } from "./controllers/paymentController.js";
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  verifyWebhookSignature,
  handleWebhook
);

// Limit payload size on regular JSON routes
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    const sig = req.headers['x-signature'] || req.headers['stripe-signature'] || req.headers['x-hub-signature'];
    if (sig) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------------- API DOCS (Swagger UI) -------------------
// Loaded lazily so an unparseable spec doesn't kill the server. Gated in prod
// by SWAGGER_ENABLED so we don't advertise the API surface publicly.
{
  const docsEnabled = NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
  if (docsEnabled) {
    try {
      const [{ default: swaggerUi }, { default: YAML }, { readFileSync }, { fileURLToPath }] = await Promise.all([
        import('swagger-ui-express'),
        import('yaml'),
        import('fs'),
        import('url'),
      ]);
      const path = await import('path');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname  = path.dirname(__filename);
      const specPath   = path.join(__dirname, 'docs', 'openapi.yaml');
      const spec       = YAML.parse(readFileSync(specPath, 'utf8'));
      app.get('/api/docs.json', (_req, res) => res.json(spec));
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
        customSiteTitle: 'JoyfulGenius API',
        swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
      }));
      console.log(`📖 Swagger docs available at /api/docs`);
    } catch (err) {
      console.warn('⚠️  Swagger UI disabled — could not load spec:', err.message);
    }
  }
}

// ------------------- API ROUTES -------------------
app.use('/api/users', userRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/results', testResultRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/materials", studyMaterialRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/lectures', lectureStudentRoutes);   // student GET
app.use('/api/admin',    lectureAdminRoutes);     // admin writes + presign
app.use('/api/bundles',  testBundleRoutes);       // test bundles (test_series)
app.use('/api/assignments', assignmentStudentRoutes);   // student: list/submit/view
app.use('/api/admin',       assignmentAdminRoutes);     // admin: CRUD + submissions

// ------------------- STATIC FILES -------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ------------------- ROOT + HEALTH CHECK -------------------
// Root route — prevents UptimeRobot / browsers hitting / from getting 404.
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'JoyfulGenius API' });
});

// Temporary email debug route — remove after confirming email works
app.get('/debug-email', async (req, res) => {
  try {
    const sendEmail = (await import('./Utils/sendEmail.js')).default;
    await sendEmail('bhoirkalpak916@gmail.com', 'JG Email Test', 'If you see this, email works!');
    res.json({ ok: true, provider: process.env.EMAIL_PROVIDER, from: 'noreply@joyfulgenius.org' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, response: e.response || null, provider: process.env.EMAIL_PROVIDER });
  }
});

// Lightweight liveness probe — used by Render/uptime monitors.
app.get('/health', (req, res) => {
  res.json({
    uptime: process.uptime(),
    env: NODE_ENV,
    dbState: mongoose.connection.readyState, // 1 = connected
  });
});

// Pre-flight check — surfaces what is wired/unwired so you can verify the
// production environment in one HTTP call. Does NOT leak secret values.
// In production the endpoint requires `?key=<HEALTH_TOKEN>` (set via env).
// If HEALTH_TOKEN is unset in production the endpoint returns 404.
app.get('/health/full', (req, res) => {
  if (NODE_ENV === 'production') {
    const expected = env.HEALTH_TOKEN;
    if (!expected || req.query.key !== expected) {
      return res.status(404).json({ message: 'Not found' });
    }
  }
  const razorpayMode =
    !env.RAZORPAY_KEY_ID ? 'unset'
      : String(env.RAZORPAY_KEY_ID).startsWith('rzp_live_') ? 'live'
      : String(env.RAZORPAY_KEY_ID).startsWith('rzp_test_') ? 'test'
      : 'unknown';
  res.json({
    uptime:  process.uptime(),
    env:     NODE_ENV,
    db:      { state: mongoose.connection.readyState, name: mongoose.connection.name || null },
    sentry:  { wired: Boolean(env.SENTRY_DSN) },
    razorpay: {
      mode:           razorpayMode,
      webhookSecret:  Boolean(env.RAZORPAY_WEBHOOK_SECRET),
    },
    email: {
      provider:    env.EMAIL_PROVIDER,
      resendKey:   Boolean(env.RESEND_API_KEY),
      sendgridKey: Boolean(env.SENDGRID_API_KEY),
    },
    aws: {
      bucketSet: Boolean(env.AWS_S3_BUCKET),
      region:    env.AWS_REGION || null,
    },
  });
});

// ------------------- FALLBACK & ERROR HANDLER -------------------
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Sentry must come before our custom error handler
if (Sentry?.Handlers?.errorHandler) {
  app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

// ------------------- START SERVER + GRACEFUL SHUTDOWN -------------------
let server;
async function startServer() {
  try {
    await initGridFS();

    server = app.listen(PORT || 3000, () => {
      console.log(`🚀 Backend server running on port ${PORT || 3000}`);
      console.log(`✅ NODE_ENV: ${NODE_ENV}`);
      console.log(`✅ Allowed Frontend: ${PROD_DOMAIN || 'localhost dev only'}`);
    });

    // mitigate slowloris / connection issues
    server.keepAliveTimeout = 65 * 1000; // 65 seconds
    server.headersTimeout = 70 * 1000; // headersTimeout must be > keepAliveTimeout
  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  try {
    if (server) {
      server.close(async (err) => {
        if (err) {
          console.error('Error closing server', err);
          process.exit(1);
        }
        // close DB connections cleanly
        try {
          await mongoose.connection.close(false);
          console.log('MongoDB connection closed.');
        } catch (e) {
          console.error('Error closing MongoDB connection', e);
        }
        process.exit(0);
      });
      // force exit if not closed in 30s
      setTimeout(() => {
        console.error('Could not close connections in time, forcing exit.');
        process.exit(1);
      }, 30 * 1000).unref();
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error('Shutdown error', e);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
