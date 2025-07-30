// index.js
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
import chapterRoutes from './routes/chapterRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from "./routes/authRoutes.js";
import testResultRoutes from './routes/testResultRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testRoutes from './routes/testRoutes.js';
import studyMaterialRoutes from "./routes/StudyMaterialRoutes.js";
import errorHandler from './middleware/errorHandler.js';



dotenv.config();

connectDB();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const app = express(); 


const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "client");
const frontendPath = path.join(currentDir, "dist");
app.use(express.static(frontendPath));


app.use(cors({ origin: ['http://localhost:5173' , 'https://yourfrontenddomain.com'], credentials: true }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// Routes
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

// Serve static files
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Correct static path
app.use('/uploads', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')));



app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGO_URI;

// MongoDB Connection with logging and timeout
// try {
//   await mongoose.connect(DB_URI, {
    
//     serverSelectionTimeoutMS: 10000,
//   });
//   console.log("✅ Connected to MongoDB");
// } catch (error) {
//   console.error("❌ MongoDB connection error:", error.message);
// }

// mongoose.connection.on('error', err => {
//   console.error('❌ MongoDB runtime error:', err);
// });

// app.get('/', (req, res) => {
//   res.send('Kalpak!');
// });
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

