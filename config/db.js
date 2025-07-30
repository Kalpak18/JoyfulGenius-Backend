// export const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nmms-platform';
// config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error('DB Connection Error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
