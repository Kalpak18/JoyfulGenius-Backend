import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from "cookie-parser";
import morgan from 'morgan';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';
import rateLimit from 'express-rate-limit';
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
import otpRoutes from './routes/otpRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from "./routes/authRoutes.js";
import testResultRoutes from './routes/testResultRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testRoutes from './routes/testRoutes.js';
import studyMaterialRoutes from "./routes/StudyMaterialRoutes.js";
import chapterRoutes from "./routes/chapterRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import errorHandler from './middleware/errorHandler.js';

const { NODE_ENV, FRONTEND_URL, PORT } = env;
const PROD_DOMAIN = FRONTEND_URL?.trim().replace(/^https?:\/\//, '');

connectDB();
const app = express();

// trust proxy (for secure cookies and rate-limiters when behind load balancer)
if (NODE_ENV === "production") {
  app.set('trust proxy', 1);
}

// disable x-powered-by
app.disable('x-powered-by');

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
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_GLOBAL: ${req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    alertsLogStream.write(logEntry);
    res.status(429).json({ message: "Too many requests. Please try again later." });
  }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    const logEntry = `[${new Date().toISOString()}] RATE_LIMIT_AUTH: ${req.ip} - ${req.originalUrl}\n`;
    securityLogStream.write(logEntry);
    alertsLogStream.write(logEntry);
    res.status(429).json({ message: "Too many login/OTP attempts. Try again later." });
  }
});
// apply to OTP and auth endpoints (login)
// app.use(['/api/otp', '/api/auth', '/api/admin'], authLimiter);

// ------------------- BODY PARSERS -------------------
// Limit payload size
// Only capture rawBody for possible webhooks (signature header) to avoid memory bloat
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    const sig = req.headers['x-signature'] || req.headers['stripe-signature'] || req.headers['x-hub-signature'];
    if (sig) {
      // keep raw Buffer for signature verification on routes that actually use it
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------------- API ROUTES -------------------
app.use('/api/users', userRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/results', testResultRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/materials", studyMaterialRoutes);
app.use('/api/courses', courseRoutes);

// ------------------- STATIC FILES -------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ------------------- HEALTH CHECK -------------------
app.get('/health', (req, res) => {
  res.json({
    uptime: process.uptime(),
    env: NODE_ENV,
    dbState: mongoose.connection.readyState
  });
});

// ------------------- FALLBACK & ERROR HANDLER -------------------
app.use((req, res) => res.status(404).json({ message: "Not found" }));
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
