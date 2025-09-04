// controllers/authController.js
import User from "../models/User.js";
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

// ==========================
// Login User
// ==========================
// ==========================
// Login User
// ==========================
// export const loginUser = async (req, res) => {
//   const { identifier, password } = req.body;

//   try {
//     if (!identifier || !password) {
//       return res
//         .status(400)
//         .json({ message: "Email/Mobile and password are required" });
//     }

//     // Determine query type (email or mobile)
//     let query = null;
//     if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
//       query = { email: identifier.toLowerCase().trim() };
//     } else if (/^\d{10}$/.test(identifier)) {
//       query = { whatsappNo: identifier.trim() };
//     } else {
//       return res
//         .status(400)
//         .json({ message: "Please enter a valid email or 10-digit mobile number" });
//     }

//     // Fetch user with password + tokenVersion for auth
//     const user = await User.findOne(query).select("+password +tokenVersion paidCourses");

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Check password
//     if (!user.password) {
//       console.warn("User exists but has no password:", user._id);
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     // Issue tokens
//     const accessToken = signAccessToken(user);
//     const refreshToken = signRefreshToken(user);
//     setRefreshCookie(res, refreshToken);

//     res.status(200).json({
//       message: "Login successful",
//       accessToken,
//       user: {
//         id: user._id,
//         name: `${user.f_name} ${user.last_name}`.trim(),
//         email: user.email,
//         whatsappNo: user.whatsappNo,
//         district: user.district,
//         isPaid: user.isPaid || false,
//         paidCourses: Array.isArray(user.paidCourses) ? user.paidCourses : [],
//       },
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ message: "Server error during login" });
//   }
// };


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
