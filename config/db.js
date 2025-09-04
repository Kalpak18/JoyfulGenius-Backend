
// config/db.js
import mongoose from 'mongoose';
import { env } from './validateEnv.js';

const { MONGO_URI} = env;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error('❌ DB Connection Error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
