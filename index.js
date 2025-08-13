import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from "url";
import connectDB from './config/db.js';
import { initGridFS } from './config/gridfs.js';

import userRoutes from './routes/UserRoutes.js';
import otpRoutes from './routes/otpRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from "./routes/authRoutes.js";
import testResultRoutes from './routes/testResultRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testRoutes from './routes/testRoutes.js';
import studyMaterialRoutes from "./routes/StudyMaterialRoutes.js";
import errorHandler from './middleware/errorHandler.js';
import chapterRoutes from "./routes/chapterRoutes.js";

dotenv.config();
connectDB();



const app = express();

const PROD_DOMAIN = process.env.FRONTEND_URL?.trim()?.replace(/^https?:\/\//, '');

// 🚀 Log allowed domains on startup
console.log('------------------------------------');
console.log(`✅ NODE_ENV: ${process.env.NODE_ENV}`);
if (process.env.NODE_ENV !== 'production') {
  console.log('✅ Dev Mode: Allowing http://localhost:* and http://127.0.0.1:*');
}
if (PROD_DOMAIN) {
  console.log(`✅ Prod Mode: Allowing https://${PROD_DOMAIN} and all subdomains (*.${PROD_DOMAIN})`);
} else {
  console.log('⚠️  No FRONTEND_URL set — only localhost allowed in production!');
}
console.log('------------------------------------');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // No Origin = allow (Postman, server-to-server)

    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    if (
  PROD_DOMAIN &&
  (origin === `https://${PROD_DOMAIN}` ||
   origin === `https://www.${PROD_DOMAIN}` ||
   origin.endsWith(`.${PROD_DOMAIN}`))
) {
  return callback(null, true);
}

    console.error(`❌ CORS blocked: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/chapter', chapterRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/results', testResultRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/materials", studyMaterialRoutes);

// Static uploads (e.g., for images or PDFs)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Global error handler
app.use(errorHandler);

async function startServer() {
  try {
    await initGridFS(); // Explicit initialization
    // await connectDB(); 
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
});
 } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
}

startServer();

// Server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`🚀 Backend server running on port ${PORT}`);
// });


