import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from "url";
import connectDB from './config/db.js';

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

// app.use(cors({
//   origin: ['http://localhost:5173', 'https://your-frontend.vercel.app'], // update later
//   credentials: true
// }));
// const allowedOrigins = process.env.FRONTEND_URL?.split(',') || [];

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true
// }));

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
      (origin === `https://${PROD_DOMAIN}` || origin.endsWith(`.${PROD_DOMAIN}`))
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

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});



// // index.js
// import express from 'express';
// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import path from 'path';
// import { fileURLToPath } from "url";
// import connectDB from './config/db.js';


// import userRoutes from './routes/UserRoutes.js';
// import otpRoutes from './routes/otpRoutes.js';
// import subjectRoutes from './routes/subjectRoutes.js';
// import adminRoutes from './routes/adminRoutes.js';
// import authRoutes from "./routes/authRoutes.js";
// import testResultRoutes from './routes/testResultRoutes.js';
// import questionRoutes from './routes/questionRoutes.js';
// import testRoutes from './routes/testRoutes.js';
// import studyMaterialRoutes from "./routes/StudyMaterialRoutes.js";
// import errorHandler from './middleware/errorHandler.js';
// import chapterRoutes from "./routes/chapterRoutes.js";



// dotenv.config();

// connectDB();

// // const __filename = fileURLToPath(import.meta.url);
// // const __dirname = path.dirname(__filename);

// const app = express(); 


// const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "client");
// const frontendPath = path.join(currentDir, "dist");
// app.use(express.static(frontendPath));


// app.use(cors({ origin: ['http://localhost:5173' , 'https://yourfrontenddomain.com'], credentials: true }));
// app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// // Routes
// app.use('/api/users', userRoutes);
// app.use('/api/otp', otpRoutes);
// app.use('/api/subjects', subjectRoutes);
// app.use('/api/chapter', chapterRoutes);
// app.use('/api/questions', questionRoutes);
// app.use('/api/admin', adminRoutes);
// app.use("/api/auth", authRoutes);
// app.use('/api/results', testResultRoutes);
// app.use("/api/tests", testRoutes);
// app.use("/api/materials", studyMaterialRoutes);

// // Serve static files
// // app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// // Correct static path
// app.use('/uploads', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')));



// app.use(errorHandler);

// const PORT = process.env.PORT || 3000;
// const DB_URI = process.env.MONGO_URI;

// // MongoDB Connection with logging and timeout
// // try {
// //   await mongoose.connect(DB_URI, {
    
// //     serverSelectionTimeoutMS: 10000,
// //   });
// //   console.log("✅ Connected to MongoDB");
// // } catch (error) {
// //   console.error("❌ MongoDB connection error:", error.message);
// // }

// // mongoose.connection.on('error', err => {
// //   console.error('❌ MongoDB runtime error:', err);
// // });

// // app.get('/', (req, res) => {
// //   res.send('Kalpak!');
// // });
// app.get("*", (req, res) => {
//   res.sendFile(path.join(frontendPath, "index.html"));
// });

// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });

