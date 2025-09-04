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

// Destructure env
const { NODE_ENV, FRONTEND_URL, PORT } = env;
const PROD_DOMAIN = FRONTEND_URL?.trim().replace(/^https?:\/\//, '');

connectDB();
const app = express();

// Enable trust proxy if behind a reverse proxy (needed for secure cookies)
if (NODE_ENV === "production") {
  app.set('trust proxy', 1);
}

// ------------------- LOGGING -------------------
const logDirectory = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);

const accessLogStream = createStream('access.log', { interval: '1d', path: logDirectory });
const securityLogStream = createStream('security.log', { interval: '1d', maxFiles: 7, path: logDirectory });
const alertsLogStream = createStream('alerts.log', { interval: '1d', maxFiles: 7, path: logDirectory });

app.use(morgan('combined', { stream: accessLogStream }));

// ------------------- SECURITY -------------------
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", PROD_DOMAIN ? `https://${PROD_DOMAIN}` : ''],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  } : false
}));

app.use(compression()); // Optional: remove if using reverse proxy
app.use(cookieParser());

// ------------------- CORS -------------------
const corsDelegate = (req, callback) => {
  const origin = req.header("Origin");

  if (!origin) return callback(null, {
    origin: true,
    credentials: true,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
  });

  if (
    NODE_ENV !== "production" &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))
  ) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
      allowedHeaders: ["Content-Type","Authorization"],
    });
  }

  if (
    PROD_DOMAIN &&
    (origin === `https://${PROD_DOMAIN}` ||
     origin === `https://www.${PROD_DOMAIN}` ||
     origin.endsWith(`.${PROD_DOMAIN}`))
  ) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
      allowedHeaders: ["Content-Type","Authorization"],
    });
  }

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
    // TODO: send email alert if repeated abuse
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
    // TODO: send email alert if repeated abuse
    res.status(429).json({ message: "Too many login/OTP attempts. Try again later." });
  }
});
app.use([ '/api/otp'], authLimiter);



// ------------------- BODY PARSER -------------------
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));
app.use(express.urlencoded({ extended: true }));

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

// ------------------- FALLBACK & ERROR HANDLER -------------------
app.use((req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);

// ------------------- START SERVER -------------------
async function startServer() {
  try {
    await initGridFS();
    app.listen(PORT || 3000, () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`✅ NODE_ENV: ${NODE_ENV}`);
      console.log(`✅ Allowed Frontend: ${PROD_DOMAIN || 'localhost dev only'}`);
    });
  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

startServer();
