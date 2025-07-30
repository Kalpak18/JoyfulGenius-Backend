// createAdmin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from './models/Admin.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const adminExists = await Admin.findOne({ email: "admin@example.com" });
    if (adminExists) {
      console.log("Admin already exists.");
      process.exit();
    }

    const newAdmin = new Admin({
      email: "admin@example.com",
      password: "admin123", // this will be hashed automatically
    });

    await newAdmin.save();
    console.log("✅ Admin created successfully.");
    process.exit();
  })
  .catch((err) => {
    console.error("DB error:", err);
    process.exit(1);
  });
