// controllers/developerController.js
//
// Developer surface — completely separate from admin/tutor/user auth.
// - Own JWT secrets (falls back to shared JWT_SECRET if dedicated ones absent)
// - Own refresh cookie (`developerRefreshToken`, scoped to /api/developer)
// - Own controllers (never call anything in adminController)
//
// The Developer role uses the same Mongo `admins` collection because that's
// where role-differentiated accounts live, but the HTTP surface, cookies,
// tokens, and controllers are all isolated from the admin surface.

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/validateEnv.js";
import Admin from "../models/Admin.js";
import Course from "../models/Course.js";

const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } = env;

const isProd    = NODE_ENV === "production";
const sameSite  = isProd ? "none" : "lax";
const secureFlg = isProd;

// ── token helpers ──────────────────────────────────────────────────
// Kept distinct from admin token helpers so a developer JWT can never
// accidentally satisfy verifyAdmin (and vice-versa).
const signDeveloperAccessToken = (dev) =>
  jwt.sign(
    { sub: dev._id.toString(), role: "developer", ver: dev.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

const signDeveloperRefreshToken = (dev) =>
  jwt.sign(
    { sub: dev._id.toString(), role: "developer", ver: dev.tokenVersion || 0 },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );

const setDeveloperRefreshCookie = (res, token) => {
  res.cookie("developerRefreshToken", token, {
    httpOnly: true,
    secure: secureFlg,
    sameSite,
    path: "/api/developer",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

const clearDeveloperRefreshCookie = (res) => {
  res.clearCookie("developerRefreshToken", {
    httpOnly: true,
    secure: secureFlg,
    sameSite,
    path: "/api/developer",
  });
};

function issueSession(dev, res) {
  const accessToken  = signDeveloperAccessToken(dev);
  const refreshToken = signDeveloperRefreshToken(dev);
  setDeveloperRefreshCookie(res, refreshToken);
  return {
    accessToken,
    role: "developer",
    user: {
      id:    dev._id,
      email: dev.email,
      name:  dev.name || "",
      role:  "developer",
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

// POST /api/developer/register
// One-time bootstrap. Locked forever after a developer exists.
export const registerDeveloper = async (req, res) => {
  try {
    const existing = await Admin.countDocuments({ role: "developer" });
    if (existing > 0) {
      return res.status(403).json({ message: "Setup already complete. Sign in at /developer/login." });
    }

    const { email, password, name } = req.body || {};
    if (!email || !password)   return res.status(400).json({ message: "Email and password are required" });
    if (password.length < 6)   return res.status(400).json({ message: "Password must be at least 6 characters" });

    const dev = await Admin.create({
      email: email.toLowerCase().trim(),
      password,
      name: name?.trim() || "",
      role: "developer",
    });

    return res.status(201).json({
      message: "Developer account created successfully.",
      ...issueSession(dev, res),
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "This email is already registered." });
    console.error("registerDeveloper error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// POST /api/developer/login
// Only accepts role="developer". Anyone else gets 403 with a hint.
export const loginDeveloper = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const dev = await Admin.findOne({ email: email.toLowerCase().trim() }).select("+password +tokenVersion");
    if (!dev) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await dev.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    if (dev.role !== "developer") {
      return res.status(403).json({
        message: "This is not a developer account. Please sign in at /admin/login.",
        redirect: "/admin/login",
      });
    }

    return res.json({
      message: "Login successful",
      ...issueSession(dev, res),
    });
  } catch (err) {
    console.error("loginDeveloper error:", err);
    return res.status(500).json({ message: "Server error during login" });
  }
};

// POST /api/developer/refresh
export const refreshDeveloperToken = async (req, res) => {
  try {
    const token = req.cookies?.developerRefreshToken;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    if (payload.role !== "developer") {
      return res.status(403).json({ message: "Wrong role for this endpoint" });
    }
    const dev = await Admin.findById(payload.sub);
    if (!dev || dev.role !== "developer") return res.status(404).json({ message: "Developer not found" });
    if (payload.ver !== (dev.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked" });
    }
    return res.json({
      accessToken: signDeveloperAccessToken(dev),
      role: "developer",
      user: { id: dev._id, email: dev.email, name: dev.name || "", role: "developer" },
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

// POST /api/developer/logout
export const logoutDeveloper = async (req, res) => {
  try {
    if (req.developer?._id) {
      await Admin.findByIdAndUpdate(req.developer._id, { $inc: { tokenVersion: 1 } });
    }
    clearDeveloperRefreshCookie(res);
    return res.json({ message: "Developer logged out" });
  } catch (err) {
    console.error("logoutDeveloper error:", err);
    return res.status(500).json({ message: "Error during logout" });
  }
};

// ══════════════════════════════════════════════════════════════════
// ADMIN ACCOUNT MANAGEMENT — the ONLY thing a developer does
// ══════════════════════════════════════════════════════════════════

// Helper: after creating the first ever admin, adopt every ownerless course
// under them. This is how the pre-migration NMMS course gets a `createdBy`.
async function adoptOrphanCoursesIfFirstAdmin(newAdmin) {
  if (newAdmin.role !== "admin") return 0;
  const adminCount = await Admin.countDocuments({ role: "admin" });
  if (adminCount !== 1) return 0; // not the first admin
  const result = await Course.updateMany(
    { $or: [{ createdBy: null }, { createdBy: { $exists: false } }] },
    { $set: { createdBy: newAdmin._id, updatedBy: newAdmin._id } }
  );
  return result.modifiedCount || 0;
}

// GET /api/developer/admins
export const listAdminAccounts = async (req, res) => {
  try {
    const admins = await Admin.find({ role: { $in: ["admin", "tutor"] } })
      .select("email name role scopedCourseIds subjectScopes createdAt tokenVersion")
      .populate("scopedCourseIds", "name slug")
      .sort({ createdAt: 1 });
    return res.json(admins);
  } catch (err) {
    console.error("listAdminAccounts error:", err);
    return res.status(500).json({ message: "Failed to fetch admins" });
  }
};

// POST /api/developer/admins
// Body: { email, password, name?, role? = "admin" | "tutor" }
// Developer only creates admins here — tutors are typically created by their
// owning admin. But we allow both so a developer can seed the platform.
export const createAdminAccount = async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
    if (password.length < 6)  return res.status(400).json({ message: "Password must be at least 6 characters" });
    const finalRole = role === "tutor" ? "tutor" : "admin";

    const admin = await Admin.create({
      email: email.toLowerCase().trim(),
      password,
      name: name?.trim() || "",
      role: finalRole,
    });

    const adoptedCourses = await adoptOrphanCoursesIfFirstAdmin(admin);

    return res.status(201).json({
      message: adoptedCourses > 0
        ? `Admin created and adopted ${adoptedCourses} pre-existing course${adoptedCourses === 1 ? "" : "s"}.`
        : "Admin account created.",
      admin: {
        id: admin._id, email: admin.email, name: admin.name, role: admin.role,
      },
      adoptedCourses,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "This email is already registered." });
    console.error("createAdminAccount error:", err);
    res.status(500).json({ message: "Server error creating admin" });
  }
};

// DELETE /api/developer/admins/:id
// Cannot delete another developer. Cannot delete self (dev-only route so this can't happen anyway).
export const deleteAdminAccount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });
    const target = await Admin.findById(id);
    if (!target) return res.status(404).json({ message: "Admin not found" });
    if (target.role === "developer") {
      return res.status(403).json({ message: "Cannot delete a developer account from here." });
    }
    await Admin.findByIdAndDelete(id);
    return res.json({ message: "Admin deleted." });
  } catch (err) {
    console.error("deleteAdminAccount error:", err);
    res.status(500).json({ message: "Server error deleting admin" });
  }
};
