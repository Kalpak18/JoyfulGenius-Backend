// controllers/authController.js
import User from "../models/User.js";
import Course from "../models/Course.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/validateEnv.js";

const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } = env;

const isProd = NODE_ENV === "production";
const sameSite = isProd ? "none" : "lax";
const secure = isProd;

// Issue Access Token (short-lived)
const signAccessToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: "user", ver: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

// Issue Refresh Token (long-lived)
const signRefreshToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: "user", ver: user.tokenVersion || 0 },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );

// Set refresh token cookie
const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/auth/refresh",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

// Login lives in controllers/usercontroller.js#loginUser.

// ==========================
// Refresh Access Token
// ==========================
export const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token" });

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (payload.ver !== (user.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked" });
    }

    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }
};

// ==========================
// Logout User
// ==========================
export const logoutUser = async (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure,
    sameSite,
  });
  res.json({ message: "Logged out" });
};


 
export const touchCourseEnrollment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const course = await Course.findById(courseId).select("enrolledUsers");
    if (!course) return res.status(404).json({ message: "Course not found" });

    const already = course.enrolledUsers.some(
      (id) => id.toString() === userId.toString()
    );
    if (!already) {
      course.enrolledUsers.push(userId);
      await course.save();
    }

    // No payload needed; just confirm success
    res.status(204).end();
  } catch (err) {
    console.error("Auto-enroll error:", err);
    res.status(500).json({ message: "Server error during auto-enrollment" });
  }
};
