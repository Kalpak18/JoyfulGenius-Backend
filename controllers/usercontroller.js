// controllers/usercontroller.js
import User from "../models/User.js";
import Course from "../models/Course.js"; 
import crypto from "crypto";
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from "../Utils/sendOtp.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import sendEmail from "../Utils/sendEmail.js";
import { env } from "../config/validateEnv.js";


const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV, FRONTEND_URL } = env;

/* ===========================
   Helpers
=========================== */

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

const issueAccess = (user) =>
  jwt.sign(
    { sub: user._id.toString(), ver: user.tokenVersion, role: user.role || "user" },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

const issueRefresh = (user) =>
  jwt.sign(
    { sub: user._id.toString(), ver: user.tokenVersion, role: user.role || "user" },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );

const cookieOptions = {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", cookieOptions);
};


// Normalize Indian phone numbers: keep last 10 digits
const normalizeMobile10 = (input) => {
  if (!input) return "";
  const digits = String(input).replace(/\D/g, "");
  return digits.slice(-10);
};

// E.164 for India (+91)
const toE164 = (ten) => (ten ? `+91${ten}` : "");

// helper to compute the lowest available serial (fast with Set)
async function computeNextSerialForCourse(courseId) {
  const result = await User.aggregate([
  { $unwind: "$paidCourses" },
  { $match: { "paidCourses.courseId": new mongoose.Types.ObjectId(courseId), "paidCourses.isPaid": true } },
  { $group: { _id: null, maxSerial: { $max: "$paidCourses.serial" } } }
]);

const maxSerial = result.length > 0 ? result[0].maxSerial : 0;
return maxSerial + 1;

}

// ----------------- Helper: generate per-course username -----------------
const generateUsername = (user, course, serial) => {
  const fname = (user.f_name || "").trim();
  const lname = (user.last_name || "").trim();
  const district = (user.district || "").trim();

  // Case: no username requirement
  if (!course.usernameFormat || course.usernameFormat === "none") {
    return { username: null, serial: null };
  }

  // Case: custom format with placeholders
  if (course.usernameFormat !== "auto") {
    const username = course.usernameFormat
      .replace("{serial}", serial)
      .replace("{fname}", fname)
      .replace("{lname}", lname)
      .replace("{district}", district);
    return { username, serial };
  }

  // Default / AUTO format
  const username = `${serial}.${fname}${lname}.${district}`;
  return { username, serial };
};


// ✅ helper to format a user same as getUsersByCourse
const formatUserForCourse = (user, courseId) => {
  const paidCourse = user.paidCourses.find(
    pc => pc.courseId && pc.courseId.toString() === courseId.toString()
  );

  const isPaid = !!(paidCourse?.isPaid);
  const username = isPaid ? paidCourse.username : null;
  const serial = isPaid ? paidCourse.serial : null;

  return {
    userId: user._id,
    name: `${user.f_name} ${user.last_name}`.trim(),
    whatsappNo: user.whatsappNo,
    district: user.district,
    status: isPaid ? "Paid" : "Enrolled",
    username,
    serial,
    isPaid,
    paidAt: isPaid ? paidCourse.paidAt : null,
    progress: isPaid ? paidCourse.progress || { completedLessons: 0, totalLessons: 0 } : null,
    testResults: isPaid ? paidCourse.testResults || [] : []
  };
};

/* ===========================
   Forgot / Reset Password (Mobile OTP)
=========================== */

// Fixed: use req.body.whatsappNo (or mobile)
export const forgotPasswordMobile = async (req, res) => {
  try {
    const raw = req.body.whatsappNo || req.body.mobile || "";
    const ten = normalizeMobile10(raw);
    if (!ten || ten.length !== 10) {
      return res.status(400).json({ message: "Valid WhatsApp number is required" });
    }

    const user = await User.findOne({ whatsappNo: ten });
    if (!user) {
      return res.status(404).json({ message: "No account found with this number" });
    }

    // 5-minute cooldown
    const MIN_OTP_INTERVAL = 5 * 60 * 1000;
    if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < MIN_OTP_INTERVAL) {
      return res.status(429).json({ message: "OTP already sent recently. Please wait before requesting again." });
    }

    await sendTwilioOtp(toE164(ten));

    user.otpLastSentAt = new Date();
    await user.save();

    res.status(200).json({ message: "OTP sent successfully to your mobile." });
  } catch (error) {
    console.error("Forgot Password Mobile Error:", error);
    res.status(500).json({ message: "Server Error. Could not send OTP." });
  }
};

export const verifyResetOtp = async (req, res) => {
  const raw = req.body.whatsappNo || req.body.mobile || "";
  const ten = normalizeMobile10(raw);
  const code = req.body.code;

  if (!ten || !code) return res.status(400).json({ message: "Number and code are required" });

  const result = await verifyTwilioOtp(toE164(ten), code);
  if (result.status !== "approved") {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  const user = await User.findOne({ whatsappNo: ten });
  if (!user) return res.status(404).json({ message: "User not found" });

  const token = crypto.randomBytes(32).toString("hex");
  user.resetToken = token;
  user.resetTokenExpire = Date.now() + 3600000; // 1 hour
  await user.save();

  return res.status(200).json({ message: "OTP verified", resetToken: token });
};

/* ===========================
   Forgot / Reset Password (Email link)
=========================== */

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const token = crypto.randomBytes(32).toString("hex");
  user.resetToken = token;
  user.resetTokenExpire = Date.now() + 3600000; // 1 hour
  await user.save();

  const resetUrl = `${FRONTEND_URL}/reset-password/${token}`;
  const message = `Reset your password by clicking here: ${resetUrl}`;

  try {
    await sendEmail(user.email, "Password Reset", message);
    res.status(200).json({ message: "Password reset link sent to email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send email" });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpire: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ message: "Invalid or expired token" });

  user.password = password;          // hashed by pre-save hook
  user.resetToken = undefined;
  user.resetTokenExpire = undefined;
  user.tokenVersion += 1;            // invalidate all existing refresh tokens
  await user.save();

  res.status(200).json({ message: "Password reset successful" });
};

/* ===========================
   Registration (no OTP variant)
=========================== */


export const registerUser = async (req, res) => {
  try {
    console.log("Register payload received:", req.body);

    let { f_name, last_name, email, whatsappNo, district, password } = req.body;

    // Trim all string inputs
    f_name = f_name?.trim();
    last_name = last_name?.trim();
    email = email?.trim();
    district = district?.trim();
    whatsappNo = normalizeMobile10(whatsappNo);

    // Validate required fields
    if (!f_name || !last_name || !whatsappNo || !district || !password) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    // Validate WhatsApp number (must be 10 digits)
    if (!/^\d{10}$/.test(whatsappNo)) {
      return res.status(400).json({ message: "WhatsApp number must be exactly 10 digits" });
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    // Check for duplicates
    const existingUserByWhatsApp = await User.findOne({ whatsappNo });
    if (existingUserByWhatsApp) {
      return res.status(400).json({ message: "WhatsApp number already registered" });
    }
    if (email) {
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    // Create the user
    const user = await User.create({
      f_name,
      last_name,
      email: email && email.trim() !== "" ? email : undefined,
      whatsappNo,
      district,
      password,
    });

    // Return safe user (without password)
    const safeUser = user.toObject();
    delete safeUser.password;

    return res.status(201).json({
      message: "User registered successfully",
      user: safeUser,
    });

  } catch (error) {
    console.error("Registration error:", error);

    // Handle duplicate key error
    if (error.code === 11000 && error.keyValue) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already registered`,
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

/* ===========================
   OTP verify + create user (OTP registration path)
=========================== */

export const verifyUserOtp = async (req, res) => {
  const raw = req.body.whatsappNo || req.body.mobile;
  const code = req.body.code;
  const userInput = req.body.user || {};

  try {
    const ten = normalizeMobile10(raw);
    if (!ten || !code) return res.status(400).json({ message: "Number and code are required" });

    const result = await verifyTwilioOtp(toE164(ten), code);
    if (result.status !== "approved") {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const newUser = new User({
      f_name: (userInput.f_name || "").trim(),
      last_name: (userInput.last_name || "").trim(),
      whatsappNo: ten,
      email: userInput.email || undefined,
      password: userInput.password, // hashed by pre-save
      district: (userInput.district || "").trim(),
      verified: true,
    });

    await newUser.save();

    const access = issueAccess(newUser);
    const refresh = issueRefresh(newUser);
    setRefreshCookie(res, refresh);

    res.status(201).json({
      success: true,
      message: "User registered & OTP verified",
      user: {
        ...newUser.toObject(),
        name: `${newUser.f_name} ${newUser.last_name}`.trim(),
        password: undefined,
      },
      accessToken: access,
    });
  } catch (error) {
    console.error("OTP verify error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
};

/* ===========================
   Login / Refresh / Logout
=========================== */

// Unified login: supports email OR whatsappNo (10-digit or raw)
export const loginUser = async (req, res) => {
  const { identifier, email, whatsappNo, password } = req.body;

  try {
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    // Normalize WhatsApp number
    const normalizedWhatsApp = whatsappNo
      ? normalizeMobile10(whatsappNo)
      : identifier
      ? normalizeMobile10(identifier)
      : null;

    // Build dynamic query
    const query = email
      ? { email }
      : normalizedWhatsApp
      ? { whatsappNo: normalizedWhatsApp }
      : identifier
      ? { $or: [{ email: identifier }, { whatsappNo: normalizeMobile10(identifier) }] }
      : null;

    if (!query) {
      return res
        .status(400)
        .json({ message: "Provide email or WhatsApp number along with password" });
    }

    // Fetch candidate users with password
    const candidates = await User.find(query).select(
      "+password +tokenVersion f_name last_name email whatsappNo district paidCourses"
    );

    if (!candidates || candidates.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fallback-proof: pick first user with matching password
    let user = null;
    for (const u of candidates) {
      if (u.password && (await u.matchPassword(password))) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res
        .status(401)
        .json({ message: "Invalid credentials or user has no password set" });
    }

    // Issue tokens
    const access = issueAccess(user);
    const refresh = issueRefresh(user);
    setRefreshCookie(res, refresh);

    // Respond with safe user info
    res.status(200).json({
      message: "Login successful",
      accessToken: access, 
      user: {
        id: user._id,
        name: `${user.f_name} ${user.last_name}`.trim(),
        email: user.email,
        whatsappNo: user.whatsappNo,
        district: user.district,
        paidCourses: user.paidCourses.map(pc => ({
        courseId: pc.courseId,
        username: pc.username,
        paidAt: pc.paidAt
        })),
        
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};


// 🔄 Refresh JWT tokens
export const refreshToken = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ message: "No refresh token provided" });

  try {
    // Verify token
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    
    // Fetch user
    const user = await User.findById(payload.sub).select(
   "+tokenVersion f_name last_name email whatsappNo district paidCourses"
   );

    if (!user) return res.status(401).json({ message: "User not found" });

    // Check token version
    if (user.tokenVersion !== payload.ver) {
      return res.status(401).json({ message: "Refresh token invalidated" });
    }

    // Rotate refresh token
    const newRefresh = issueRefresh(user);
    setRefreshCookie(res, newRefresh);

    // Issue new access token
    const accessToken = issueAccess(user);
 res.status(200).json({
    message: "Token refreshed",
    accessToken,
    user: {
      id: user._id,
      name: `${user.f_name} ${user.last_name}`.trim(),
      email: user.email,
      whatsappNo: user.whatsappNo,
      district: user.district,
      paidCourses: (user.paidCourses || []).map(pc => ({
        courseId: pc.courseId,
        username: pc.username,
        paidAt: pc.paidAt,
      })),
    },
  });
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Refresh token expired" : "Refresh token invalid";
    return res.status(401).json({ message: msg });
  }
};

// 🔒 Logout user
export const logout = async (req, res) => {
  try {
    if (req.user?.id) {
      // Invalidate all existing refresh tokens
      await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
    }

    clearRefreshCookie(res);

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error during logout" });
  }
};


/* ===========================
   Profile / Payment (Multi-Course)
=========================== */
// ===========================
// Get all users by course
// ===========================
export const getUsersByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ message: "Invalid course ID" });

    const course = await Course.findById(courseId).select("title usernameFormat");
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Find users either enrolled or paid for this course
    const users = await User.find({
      $or: [
        { enrolledCourses: courseId },
        { "paidCourses.courseId": courseId }
      ]
    }).select("f_name last_name whatsappNo district enrolledCourses paidCourses");

    const formattedUsers = users.map(user => {
      const paidCourse = user.paidCourses.find(
        pc => pc.courseId && pc.courseId.toString() === courseId
      );

      const isPaid = !!(paidCourse?.isPaid);
      const username = isPaid ? paidCourse.username : null;
      const serial = isPaid ? paidCourse.serial : null;

      return {
        userId: user._id,
        name: `${user.f_name} ${user.last_name}`.trim(),
        whatsappNo: user.whatsappNo,
        district: user.district,
        status: isPaid ? "Paid" : "Enrolled",
        username,
        serial,
        isPaid,
        paidAt: isPaid ? paidCourse.paidAt : null,
        progress: isPaid ? paidCourse.progress || { completedLessons: 0, totalLessons: 0 } : null,
        testResults: isPaid ? paidCourse.testResults || [] : [],
      };
    });

    res.json({ courseId, courseName: course.title, users: formattedUsers });

  } catch (err) {
    console.error("Get users by course error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ===========================
// Mark user paid for course
// Handles serials and usernames
// ===========================
export const markUserPaidForCourse = async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const user = await User.findById(userId);
    const course = await Course.findById(courseId).select("title usernameFormat");

    if (!user || !course) {
      return res.status(404).json({ message: "User or Course not found" });
    }

    let paidCourse = user.paidCourses.find(pc => pc.courseId.toString() === courseId);
    if (!paidCourse) {
      paidCourse = { courseId, isPaid: false };
      user.paidCourses.push(paidCourse);
    }

    // ✅ assign serial + username correctly
    const nextSerial = await computeNextSerialForCourse(courseId);
    const { username, serial } = generateUsername(user, course, nextSerial);
    paidCourse.serial = serial;
    paidCourse.username = username;
    paidCourse.isPaid = true;
    paidCourse.paidAt = new Date();

    await user.save();

    const formattedUser = formatUserForCourse(user, courseId);
    res.json({ success: true, user: formattedUser });
  } catch (err) {
    console.error("Mark paid error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// ===========================
// Unmark user paid for course
// Clears serial and username immediately
// ===========================

export const unmarkUserPaidForCourse = async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    const paidCourse = user.paidCourses.find(
      pc => pc.courseId.toString() === courseId
    );

    if (!paidCourse) {
      return res.status(404).json({ message: "User not marked paid for this course" });
    }

    paidCourse.isPaid = false;
    paidCourse.username = null;
    paidCourse.serial = null;
    paidCourse.paidAt = null;

    await user.save();

    // ✅ format and return updated user
    const formattedUser = formatUserForCourse(user, courseId);
    res.json({ success: true, user: formattedUser });
  } catch (err) {
    console.error("Unmark paid error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ===========================
// Toggle paid status
// Calls mark/unmark
// ===========================
export const togglePaidStatusForCourse = async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    const paidCourse = user.paidCourses.find(
      pc => pc.courseId.toString() === courseId
    );

    if (paidCourse && paidCourse.isPaid) {
      // already paid → unmark
      paidCourse.isPaid = false;
      paidCourse.username = null;
      paidCourse.serial = null;
      paidCourse.paidAt = null;
    } else {
      // mark as paid
      const course = await Course.findById(courseId).select("title usernameFormat");
      if (!course) return res.status(404).json({ message: "Course not found" });

      let targetCourse = paidCourse;
      if (!targetCourse) {
        targetCourse = { courseId, isPaid: false };
        user.paidCourses.push(targetCourse);
      }

      const nextSerial = await computeNextSerialForCourse(courseId);
      const { username, serial } = generateUsername(user, course, nextSerial);
      targetCourse.serial = serial;
      targetCourse.username = username;
      targetCourse.isPaid = true;
      targetCourse.paidAt = new Date();
    }

    await user.save();

    const formattedUser = formatUserForCourse(user, courseId);
    res.json({ success: true, user: formattedUser });
  } catch (err) {
    console.error("Toggle paid status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ----------------- 5. Update progress -----------------
export const updateCourseProgress = async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const { completedLessons, totalLessons } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const paidCourse = user.paidCourses.find(
  pc => pc.courseId && pc.courseId.toString() === courseId && pc.isPaid
);
if (!paidCourse) return res.status(404).json({ message: "Course not paid by user" });


    if (completedLessons !== undefined) paidCourse.progress.completedLessons = completedLessons;
    if (totalLessons !== undefined) paidCourse.progress.totalLessons = totalLessons;

    await user.save();
    res.json({ message: "Progress updated", progress: paidCourse.progress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ----------------- 6. Update test result -----------------
export const updateCourseTestResult = async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const { testId, score } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const paidCourse = user.paidCourses.find(
      pc => pc.courseId && pc.courseId.toString() === courseId

    );
    if (!paidCourse) return res.status(404).json({ message: "Course not found in user" });

    paidCourse.testResults.push({ testId, score, attemptedAt: new Date() });

    await user.save();
    res.json({ message: "Test result updated", testResults: paidCourse.testResults });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// export const getUserProfile = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     res.status(200).json({
//       ...user.toObject(),
//       name: `${user.f_name} ${user.last_name}`.trim(),
//       paidCourses: user.paidCourses.map(pc => ({
//     courseId: pc.courseId,
//     username: pc.username,
//     paidAt: pc.paidAt
//   })),
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Server error" });
//   }
// };

export const updateEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    if (await User.findOne({ email, _id: { $ne: req.user.id } })) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.email = email.trim();
    await user.save();

    res.status(200).json({ message: "Email updated successfully" });
  } catch (err) {
    console.error("❌ Email update error:", err);
    res.status(500).json({ message: "Server error while updating email" });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    clearRefreshCookie(res);
    res.status(200).json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Delete account error:", err);
    res.status(500).json({ message: "Server error while deleting account" });
  }
};

// // 🔹 Get current user with all paid courses
// export const getCurrentUser = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("f_name last_name whatsappNo email district paidCourses");
//     if (!user) return res.status(404).json({ message: "User not found" });

//       res.json({
//       id: user._id,
//       name: `${user.f_name} ${user.last_name}`.trim(),
//       email: user.email,
//       whatsappNo: user.whatsappNo,
//       district: user.district,
//       paidCourses: user.paidCourses.map(pc => ({
//       courseId: pc.courseId,
//       username: pc.username,
//       paidAt: pc.paidAt
//     })),
//   });

//   } catch {
//     res.status(500).json({ message: "Server error" });
//   }
// };


// =====================
// Get user profile with full course info
// =====================
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate({ path: "paidCourses.courseId", select: "name" })   // ✅ fixed
      .populate({ path: "enrolledCourses", select: "name" });       // ✅ fixed

    if (!user) return res.status(404).json({ message: "User not found" });

    const paidMap = new Map(
      (user.paidCourses || []).map(pc => [
        pc.courseId?._id?.toString(),
        {
          courseId: pc.courseId?._id || null,
          courseName: pc.courseId?.name || null,  // ✅ fixed
          username: pc.username,
          serial: pc.serial,
          isPaid: pc.isPaid || false,
          paidAt: pc.paidAt || null,
          progress: pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        },
      ])
    );

    const courses = (user.enrolledCourses || []).map(course => {
      const paidData = paidMap.get(course._id.toString());
      return {
        courseId: course._id,
        courseName: course.name || "---",  // ✅ fixed
        isPaid: paidData?.isPaid || false,
        username: paidData?.username || null,
        serial: paidData?.serial || null,
        paidAt: paidData?.paidAt || null,
        progress: paidData?.progress || { completedLessons: 0, totalLessons: 0 },
        testResults: paidData?.testResults || [],
      };
    });

    // Add any paid-only courses
    user.paidCourses.forEach(pc => {
      if (!user.enrolledCourses.some(c => c._id.toString() === pc.courseId?._id?.toString())) {
        courses.push({
          courseId: pc.courseId?._id || null,
          courseName: pc.courseId?.name || "---",  // ✅ fixed
          isPaid: pc.isPaid || false,
          username: pc.username,
          serial: pc.serial,
          paidAt: pc.paidAt || null,
          progress: pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        });
      }
    });

    res.status(200).json({
      userId: user._id,
      name: `${user.f_name} ${user.last_name}`.trim(),
      email: user.email,
      whatsappNo: user.whatsappNo,
      district: user.district,
      courses,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// =====================
// Get current user (for dashboard / refresh token)
// =====================
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("f_name last_name whatsappNo email district paidCourses enrolledCourses")
      .populate({
        path: "paidCourses.courseId",
        select: "name", // ✅ Course model uses `name`, not `title`
      })
      .populate({
        path: "enrolledCourses",
        select: "name", // ✅ Course model uses `name`
      });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Build a map of paidCourses for quick lookup
    const paidMap = new Map(
      (user.paidCourses || []).map(pc => [
        pc.courseId?._id?.toString(),
        {
          courseId: pc.courseId?._id || null,
          courseName: pc.courseId?.name || null,
          username: pc.username,
          serial: pc.serial,
          isPaid: pc.isPaid || false,
          paidAt: pc.paidAt || null,
          progress: pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        },
      ])
    );

    // Start with enrolledCourses
    const courses = (user.enrolledCourses || []).map(course => {
      const paidData = paidMap.get(course._id.toString());
      return {
        courseId: course._id,
        courseName: course.name || "---",
        isPaid: paidData?.isPaid || false,
        username: paidData?.username || null,
        serial: paidData?.serial || null,
        paidAt: paidData?.paidAt || null,
        progress: paidData?.progress || { completedLessons: 0, totalLessons: 0 },
        testResults: paidData?.testResults || [],
      };
    });

    // Add paidCourses not in enrolledCourses (edge case)
    user.paidCourses.forEach(pc => {
      if (
        pc.courseId &&
        !user.enrolledCourses.some(c => c._id.toString() === pc.courseId?._id?.toString())
      ) {
        courses.push({
          courseId: pc.courseId?._id || null,
          courseName: pc.courseId?.name || "---",
          isPaid: pc.isPaid || false,
          username: pc.username,
          serial: pc.serial,
          paidAt: pc.paidAt || null,
          progress: pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        });
      }
    });

    res.status(200).json({
      userId: user._id,
      name: `${user.f_name} ${user.last_name}`.trim(),
      email: user.email,
      whatsappNo: user.whatsappNo,
      district: user.district,
      courses, // ✅ unified list
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};




// Track when a user visits a course (enroll only, no paid/username yet)
export const trackCourseVisit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ message: "Invalid course ID" });

    const [user, course] = await Promise.all([
      User.findById(userId),
      Course.findById(courseId),
    ]);

    if (!user) return res.status(404).json({ message: "User not found" });
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Check if user is already enrolled
    const alreadyEnrolled =
      user.enrolledCourses?.some(id => id.toString() === courseId);

    if (!alreadyEnrolled) {
      user.enrolledCourses = user.enrolledCourses || [];
      user.enrolledCourses.push(courseId);
      await user.save();
    }

    res.status(200).json({ message: "Course enrolled successfully" });
  } catch (err) {
    console.error("Track course visit error:", err);
    res.status(500).json({ message: "Failed to track course visit" });
  }
};
