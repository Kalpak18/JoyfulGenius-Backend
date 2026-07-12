/**
 * One-time script to reset/create the admin password correctly.
 * Run: node scripts/resetAdminPassword.js
 *
 * It will:
 *  1. Find the admin by email (or create one if none exists)
 *  2. Set the new password via the model's pre-save hook (so it's properly hashed)
 *  3. Reset tokenVersion to 0
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Admin from "../models/Admin.js";

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "YOUR_ADMIN_EMAIL_HERE";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "YOUR_NEW_PASSWORD_HERE";

if (ADMIN_EMAIL === "YOUR_ADMIN_EMAIL_HERE" || ADMIN_PASSWORD === "YOUR_NEW_PASSWORD_HERE") {
  console.error("❌  Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.");
  console.error("   Example: ADMIN_EMAIL=you@email.com ADMIN_PASSWORD=NewPass123 node scripts/resetAdminPassword.js");
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅  Connected to MongoDB");

  let admin = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() }).select("+password +tokenVersion");

  if (!admin) {
    console.log("⚠️  Admin not found — creating new admin account...");
    admin = new Admin({ email: ADMIN_EMAIL.toLowerCase(), password: ADMIN_PASSWORD });
  } else {
    console.log(`✅  Found admin: ${admin.email}`);
    admin.password = ADMIN_PASSWORD;   // pre-save hook will hash this
    admin.tokenVersion = (admin.tokenVersion || 0) + 1; // invalidate old sessions
  }

  await admin.save();
  console.log("✅  Admin password updated successfully.");
  console.log(`   Email:    ${admin.email}`);
  console.log(`   You can now log in with the new password.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
