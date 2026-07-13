// controllers/usercontroller.js
import User from "../models/User.js";
import Course from "../models/Course.js";
import Lecture from "../models/Lecture.js";
import Chapter from "../models/chapter.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import sendEmail, { buildOtpEmail } from "../Utils/sendEmail.js";
import { env } from "../config/validateEnv.js";


const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV, FRONTEND_URL } = env;

/* ===========================
   Pending registration store
   ───────────────────────────
   We DO NOT write the user to MongoDB until they verify the OTP we sent
   to their email. This map holds unverified registrations for up to 15 minutes,
   keyed by their email address. The password is hashed before being stored
   here so we never keep plaintext in memory.
=========================== */
const pendingRegistrations = new Map(); // email → { hashedFields..., otp, otpExpire, createdAt }
const PENDING_TTL_MS    = 15 * 60 * 1000; // 15 min
const OTP_TTL_MS        = 10 * 60 * 1000; // 10 min
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;  // 1 min between sends

function getPending(email) {
  const entry = pendingRegistrations.get(email);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    pendingRegistrations.delete(email);
    return null;
  }
  return entry;
}

// Sweep expired entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingRegistrations) {
    if (now - v.createdAt > PENDING_TTL_MS) pendingRegistrations.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

const generateOtp = () => String(crypto.randomInt(100000, 999999));

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

// Format a User doc's enrollment record for a given courseId. Used by
// admin-facing endpoints. No per-course username/serial anymore — students
// are identified by their platform-wide handle.
const formatUserForCourse = (user, courseId) => {
  const paidCourse = user.paidCourses.find(
    pc => pc.courseId && pc.courseId.toString() === courseId.toString()
  );
  const isPaid = !!(paidCourse?.isPaid);
  return {
    userId:     user._id,
    handle:     user.handle || null,
    name:       `${user.f_name} ${user.last_name}`.trim(),
    whatsappNo: user.whatsappNo,
    district:   user.district,
    status:     isPaid ? "Paid" : "Enrolled",
    isPaid,
    paidAt:     isPaid ? paidCourse.paidAt : null,
    progress:   isPaid ? paidCourse.progress || { completedLessons: 0, totalLessons: 0 } : null,
    testResults:isPaid ? paidCourse.testResults || [] : [],
  };
};

// ── Platform handle helpers ────────────────────────────────────────
// Instagram-style: 3–24 chars, lowercase letters/digits/_/. only.
const HANDLE_RE = /^[a-z0-9_.]{3,24}$/;
export const normalizeHandle = (raw) =>
  String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24);

// Deterministically make a handle from a first name + a random suffix.
// Used at signup when the user didn't pick one and by the migration script.
export async function generateHandleFor(firstName) {
  const base = normalizeHandle(firstName) || "user";
  // 4 char base62-ish suffix
  const suffix = () => Math.random().toString(36).slice(2, 6);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${base}_${suffix()}`.slice(0, 24);
    const exists = await User.exists({ handle: candidate });
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback
  return `${base}_${Date.now().toString(36).slice(-6)}`;
}

/* ===========================
   Forgot / Reset Password (Mobile OTP) — REMOVED
   ────────────────────────────────────────────
   Twilio integration has been removed. Password reset is now email-only
   via forgotPassword / resetPassword below. The mobile-OTP routes are
   no longer mounted in UserRoutes.js.
=========================== */

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
   Registration — STEP 1: stash data + send email OTP
   ──────────────────────────────────────────────────
   This does NOT create a User in MongoDB. It validates the form,
   hashes the password, parks the data in pendingRegistrations,
   and emails a 6-digit OTP. The User is only created in STEP 2
   when /verify-email-otp is called with a valid code.
=========================== */
export const registerUser = async (req, res) => {
  try {
    let { f_name, last_name, email, whatsappNo, district, password } = req.body;

    f_name     = f_name?.trim();
    last_name  = last_name?.trim();
    email      = (email || "").trim().toLowerCase();
    district   = district?.trim();
    whatsappNo = normalizeMobile10(whatsappNo);

    // Required fields — email is now REQUIRED (it's how we verify)
    if (!f_name || !last_name || !whatsappNo || !district || !password || !email) {
      return res.status(400).json({ message: "Please fill all required fields (email is required)." });
    }
    if (!/^\d{10}$/.test(whatsappNo)) {
      return res.status(400).json({ message: "WhatsApp number must be exactly 10 digits." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Reject if either email or WhatsApp is already a live account
    const [byEmail, byWa] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ whatsappNo }),
    ]);
    if (byEmail) return res.status(400).json({ message: "Email already registered." });
    if (byWa)    return res.status(400).json({ message: "WhatsApp number already registered." });

    // Reject if another pending registration is in-flight for this WhatsApp
    for (const [, entry] of pendingRegistrations) {
      if (entry.whatsappNo === whatsappNo && entry.email !== email) {
        return res.status(400).json({
          message: "A registration with this WhatsApp number is in progress. Please verify or try again later.",
        });
      }
    }

    // Hash password now — never keep plaintext in memory
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp       = generateOtp();
    const otpExpire = Date.now() + OTP_TTL_MS;

    pendingRegistrations.set(email, {
      email, f_name, last_name, whatsappNo, district,
      hashedPassword,
      otp, otpExpire,
      createdAt:     Date.now(),
      lastSentAt:    Date.now(),
    });

    let devOtpForResponse = null;
    try {
      await sendEmail(
        email,
        "Your Joyful Genius verification code",
        `Your verification code is ${otp}. It expires in 10 minutes.`,
        buildOtpEmail(otp, f_name)
      );
    } catch (mailErr) {
      console.error("Email OTP send failed:", mailErr.message, mailErr.response || mailErr.responseCode || "");
      console.error("Email config — provider:", process.env.EMAIL_PROVIDER, "| from:", process.env.EMAIL_USER || "resend");
      // In development, don't block registration if SMTP is broken —
      // print the OTP to the server log and return it in the response.
      // In production, fail hard so students can't get stuck without email.
      if (process.env.NODE_ENV === "production") {
        pendingRegistrations.delete(email);
        return res.status(502).json({ message: "Could not send verification email. Please check the address." });
      }
      console.warn(`⚠️  DEV MODE — OTP for ${email}: ${otp}`);
      devOtpForResponse = otp;
    }

    return res.status(200).json({
      message:   "Verification code sent to your email.",
      pending:   true,
      email,
      expiresIn: Math.floor(OTP_TTL_MS / 1000),
      // Only present when email failed AND we're in dev
      ...(devOtpForResponse ? { devOtp: devOtpForResponse } : {}),
    });
  } catch (error) {
    console.error("Registration (stage 1) error:", error);
    return res.status(500).json({ message: "Server error. Could not start registration." });
  }
};

/* ===========================
   Registration — STEP 2: verify OTP, create User, auto-login
=========================== */
export const verifyUserOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code  = String(req.body.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const entry = getPending(email);
    if (!entry) {
      return res.status(400).json({ message: "No pending registration found. Please start again." });
    }
    if (Date.now() > entry.otpExpire) {
      pendingRegistrations.delete(email);
      return res.status(400).json({ message: "Verification code expired. Please register again." });
    }
    if (entry.otp !== code) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    // Race-guard: ensure nobody else grabbed this email or WhatsApp in the meantime
    const [byEmail, byWa] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ whatsappNo: entry.whatsappNo }),
    ]);
    if (byEmail || byWa) {
      pendingRegistrations.delete(email);
      return res.status(400).json({ message: "Account already exists. Please log in." });
    }

    // Create the user. Bypass pre-save password hashing — the password is
    // already hashed in the pending store.
    // Auto-generate a platform handle so the account is complete on day 1.
    // The user can rename it later via PATCH /users/me/handle.
    const handle = await generateHandleFor(entry.f_name);
    const user = new User({
      handle,
      f_name:    entry.f_name,
      last_name: entry.last_name,
      email:     entry.email,
      whatsappNo:entry.whatsappNo,
      district:  entry.district,
      verified:  true,
    });
    user.password = entry.hashedPassword;
    // Mark password as not modified so the pre-save hook doesn't re-hash it
    user.markModified = function () {};
    // Easier: bypass the hook by saving once with a custom marker
    user.$skipPasswordHash = true;
    await user.save({ validateBeforeSave: true });

    pendingRegistrations.delete(email);

    const access  = issueAccess(user);
    const refresh = issueRefresh(user);
    setRefreshCookie(res, refresh);

    const safeUser = user.toObject();
    delete safeUser.password;

    return res.status(201).json({
      success:     true,
      message:     "Email verified. Account created.",
      accessToken: access,
      user: {
        ...safeUser,
        name: `${user.f_name} ${user.last_name}`.trim(),
      },
    });
  } catch (error) {
    console.error("verifyUserOtp error:", error);
    return res.status(500).json({ message: "Server error during verification." });
  }
};

/* ===========================
   Resend the registration OTP
=========================== */
export const resendRegistrationOtp = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required." });

    const entry = getPending(email);
    if (!entry) {
      return res.status(400).json({ message: "No pending registration for this email. Please register again." });
    }
    if (entry.lastSentAt && Date.now() - entry.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - entry.lastSentAt)) / 1000);
      return res.status(429).json({ message: `Please wait ${wait}s before requesting a new code.` });
    }

    entry.otp        = generateOtp();
    entry.otpExpire  = Date.now() + OTP_TTL_MS;
    entry.lastSentAt = Date.now();

    try {
      await sendEmail(
        email,
        "Your Joyful Genius verification code",
        `Your new verification code is ${entry.otp}. It expires in 10 minutes.`,
        buildOtpEmail(entry.otp, entry.f_name)
      );
    } catch (mailErr) {
      console.error("Resend email OTP failed:", mailErr.message);
      return res.status(502).json({ message: "Could not send verification email." });
    }

    return res.json({ success: true, message: "New code sent." });
  } catch (err) {
    console.error("resendRegistrationOtp error:", err);
    return res.status(500).json({ message: "Failed to resend code." });
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
      "+password +tokenVersion handle f_name last_name email whatsappNo district paidCourses"
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
        id:         user._id,
        handle:     user.handle || null,
        name:       `${user.f_name} ${user.last_name}`.trim(),
        email:      user.email,
        whatsappNo: user.whatsappNo,
        district:   user.district,
        paidCourses: user.paidCourses.map(pc => ({
          courseId: pc.courseId,
          isPaid:   pc.isPaid || false,
          paidAt:   pc.paidAt,
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
      "+tokenVersion handle f_name last_name email whatsappNo district paidCourses"
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
        id:         user._id,
        handle:     user.handle || null,
        name:       `${user.f_name} ${user.last_name}`.trim(),
        email:      user.email,
        whatsappNo: user.whatsappNo,
        district:   user.district,
        paidCourses: (user.paidCourses || []).map(pc => ({
          courseId: pc.courseId,
          isPaid:   pc.isPaid || false,
          paidAt:   pc.paidAt,
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

    const course = await Course.findById(courseId).select("name");
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Users enrolled or paid for this course
    const users = await User.find({
      $or: [
        { enrolledCourses: courseId },
        { "paidCourses.courseId": courseId },
      ],
    }).select("handle f_name last_name email whatsappNo district enrolledCourses paidCourses");

    const formattedUsers = users.map(user => {
      const paidCourse = user.paidCourses.find(
        pc => pc.courseId && pc.courseId.toString() === courseId
      );
      const isPaid = !!(paidCourse?.isPaid);
      return {
        userId:      user._id,
        handle:      user.handle || null,
        name:        `${user.f_name} ${user.last_name}`.trim(),
        email:       user.email || null,
        whatsappNo:  user.whatsappNo,
        district:    user.district,
        status:      isPaid ? "Paid" : "Enrolled",
        isPaid,
        paidAt:      isPaid ? paidCourse.paidAt : null,
        progress:    isPaid ? paidCourse.progress || { completedLessons: 0, totalLessons: 0 } : null,
        testResults: isPaid ? paidCourse.testResults || [] : [],
      };
    });

    res.json({ courseId, courseName: course.name, users: formattedUsers });

  } catch (err) {
    console.error("Get users by course error:", err);
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

/* ===========================
   GDPR: Export personal data
   GET /api/users/my-data
   Returns a JSON bundle of everything stored about the authenticated user.
=========================== */
export const exportMyData = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -resetToken -resetTokenExpire -tokenVersion")
      .populate({ path: "paidCourses.courseId", select: "name" })
      .populate({ path: "enrolledCourses", select: "name" })
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    res
      .setHeader("Content-Disposition", `attachment; filename="joyfulgenius-data-${user._id}.json"`)
      .setHeader("Content-Type", "application/json")
      .status(200)
      .json({
        exportedAt: new Date().toISOString(),
        notice: "This is all personal data JoyfulGenius holds about you.",
        data: user,
      });
  } catch (err) {
    console.error("Export data error:", err);
    res.status(500).json({ message: "Server error while exporting data" });
  }
};

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
          courseId:    pc.courseId?._id || null,
          courseName:  pc.courseId?.name || null,
          isPaid:      pc.isPaid || false,
          paidAt:      pc.paidAt || null,
          progress:    pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        },
      ])
    );

    const courses = (user.enrolledCourses || []).map(course => {
      const paidData = paidMap.get(course._id.toString());
      return {
        courseId:    course._id,
        courseName:  course.name || "---",
        isPaid:      paidData?.isPaid || false,
        paidAt:      paidData?.paidAt || null,
        progress:    paidData?.progress || { completedLessons: 0, totalLessons: 0 },
        testResults: paidData?.testResults || [],
      };
    });

    // Add any paid-only courses
    user.paidCourses.forEach(pc => {
      if (!user.enrolledCourses.some(c => c._id.toString() === pc.courseId?._id?.toString())) {
        courses.push({
          courseId:    pc.courseId?._id || null,
          courseName:  pc.courseId?.name || "---",
          isPaid:      pc.isPaid || false,
          paidAt:      pc.paidAt || null,
          progress:    pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        });
      }
    });

    res.status(200).json({
      userId:     user._id,
      handle:     user.handle || null,
      name:       `${user.f_name} ${user.last_name}`.trim(),
      email:      user.email,
      whatsappNo: user.whatsappNo,
      district:   user.district,
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
      .select("handle f_name last_name whatsappNo email district paidCourses enrolledCourses")
      .populate({ path: "paidCourses.courseId", select: "name" })
      .populate({ path: "enrolledCourses",      select: "name" });

    if (!user) return res.status(404).json({ message: "User not found" });

    const paidMap = new Map(
      (user.paidCourses || []).map(pc => [
        pc.courseId?._id?.toString(),
        {
          courseId:    pc.courseId?._id || null,
          courseName:  pc.courseId?.name || null,
          isPaid:      pc.isPaid || false,
          paidAt:      pc.paidAt || null,
          progress:    pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        },
      ])
    );

    const courses = (user.enrolledCourses || []).map(course => {
      const paidData = paidMap.get(course._id.toString());
      return {
        courseId:    course._id,
        courseName:  course.name || "---",
        isPaid:      paidData?.isPaid || false,
        paidAt:      paidData?.paidAt || null,
        progress:    paidData?.progress || { completedLessons: 0, totalLessons: 0 },
        testResults: paidData?.testResults || [],
      };
    });

    user.paidCourses.forEach(pc => {
      if (pc.courseId && !user.enrolledCourses.some(c => c._id.toString() === pc.courseId?._id?.toString())) {
        courses.push({
          courseId:    pc.courseId?._id || null,
          courseName:  pc.courseId?.name || "---",
          isPaid:      pc.isPaid || false,
          paidAt:      pc.paidAt || null,
          progress:    pc.progress || { completedLessons: 0, totalLessons: 0 },
          testResults: pc.testResults || [],
        });
      }
    });

    res.status(200).json({
      userId:     user._id,
      handle:     user.handle || null,
      name:       `${user.f_name} ${user.last_name}`.trim(),
      email:      user.email,
      whatsappNo: user.whatsappNo,
      district:   user.district,
      courses,
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};




// Track when a user visits a course (enroll only, no paid/username yet)
// ── Save lecture progress + resume point (called by CoursePlayerPage) ──────────
// PATCH /users/me/progress
// Body: { courseId, lectureId, chapterId, subjectId, completed: bool }
export const saveProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, lectureId, chapterId, subjectId, completed } = req.body;

    if (!courseId || !lectureId) {
      return res.status(400).json({ message: "courseId and lectureId are required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const pc = user.paidCourses.find(
      p => p.courseId && p.courseId.toString() === courseId
    );
    if (!pc) return res.status(404).json({ message: "Course not found for user" });

    // Always update resume pointer
    pc.lastLectureId  = lectureId;
    pc.lastChapterId  = chapterId  || pc.lastChapterId;
    pc.lastSubjectId  = subjectId  || pc.lastSubjectId;
    pc.lastAccessedAt = new Date();

    // Mark lecture complete if requested (idempotent)
    if (completed) {
      const already = pc.completedLectureIds.some(id => id.toString() === lectureId);
      if (!already) {
        pc.completedLectureIds.push(lectureId);
        pc.progress.completedLessons = pc.completedLectureIds.length;

        // Refresh totalLessons on every completion so the dashboard percentage stays
        // accurate even after the admin adds new lectures. This is a cheap counted query.
        try {
          const chapterIds = await Chapter.find({ courseId })
            .select("_id").lean();
          if (chapterIds.length) {
            const total = await Lecture.countDocuments({
              chapterId: { $in: chapterIds.map(c => c._id) },
              deletedAt: null,
            });
            pc.progress.totalLessons = total;
          }
        } catch (e) {
          // non-fatal — the next read will recompute
          console.warn("totalLessons recount failed:", e.message);
        }
      }
    }

    await user.save();
    res.json({
      lastLectureId:       pc.lastLectureId,
      lastChapterId:       pc.lastChapterId,
      lastSubjectId:       pc.lastSubjectId,
      completedLectureIds: pc.completedLectureIds,
      progress:            pc.progress,
    });
  } catch (err) {
    console.error("saveProgress error:", err);
    res.status(500).json({ message: "Failed to save progress" });
  }
};

// ── Get progress for a course (resume data) ────────────────────────────────────
// GET /users/me/progress/:courseId
export const getProgress = async (req, res) => {
  try {
    const userId   = req.user.id;
    const { courseId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const pc = user.paidCourses.find(
      p => p.courseId && p.courseId.toString() === courseId
    );
    if (!pc) return res.json({ completedLectureIds: [], progress: { completedLessons: 0, totalLessons: 0 } });

    res.json({
      lastLectureId:       pc.lastLectureId  || null,
      lastChapterId:       pc.lastChapterId  || null,
      lastSubjectId:       pc.lastSubjectId  || null,
      lastAccessedAt:      pc.lastAccessedAt || null,
      completedLectureIds: pc.completedLectureIds || [],
      progress:            pc.progress,
    });
  } catch (err) {
    console.error("getProgress error:", err);
    res.status(500).json({ message: "Failed to get progress" });
  }
};

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

// ─── Progress summary ─────────────────────────────────────────────────────
// GET /users/me/progress-summary
// Returns: [{ courseId, courseName, isPaid, completed, total, pct, lastAccessedAt, certified }]
// Cheap-ish — one Lecture.aggregate per call. Cached in-memory could be added later.
export const getProgressSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate("paidCourses.courseId", "name slug")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const courseIds = user.paidCourses
      .map(pc => pc.courseId?._id || pc.courseId)
      .filter(Boolean);

    if (!courseIds.length) return res.json([]);

    // Get chapter ids per course in one query
    const chapters = await Chapter.find({ courseId: { $in: courseIds } })
      .select("_id courseId").lean();
    const chapterIdsByCourse = new Map();
    for (const ch of chapters) {
      const key = ch.courseId.toString();
      if (!chapterIdsByCourse.has(key)) chapterIdsByCourse.set(key, []);
      chapterIdsByCourse.get(key).push(ch._id);
    }

    // Count lectures per course in one aggregate
    const lectureCounts = await Lecture.aggregate([
      { $match: { deletedAt: null, chapterId: { $in: chapters.map(c => c._id) } } },
      { $lookup: { from: "chapters", localField: "chapterId", foreignField: "_id", as: "chapter" } },
      { $unwind: "$chapter" },
      { $group: { _id: "$chapter.courseId", total: { $sum: 1 } } },
    ]);
    const totalByCourse = new Map(lectureCounts.map(r => [r._id.toString(), r.total]));

    const certifiedSet = new Set((user.certificates || []).map(c => c.courseId.toString()));

    const out = user.paidCourses
      .filter(pc => pc.courseId)
      .map(pc => {
        const cid = (pc.courseId._id || pc.courseId).toString();
        const total = totalByCourse.get(cid) || 0;
        const completed = (pc.completedLectureIds || []).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          courseId:       cid,
          courseName:     pc.courseId.name || "",
          courseSlug:     pc.courseId.slug || "",
          isPaid:         pc.isPaid,
          completed,
          total,
          pct,
          lastAccessedAt: pc.lastAccessedAt || null,
          certified:      certifiedSet.has(cid),
        };
      });

    return res.json(out);
  } catch (err) {
    console.error("getProgressSummary error:", err);
    return res.status(500).json({ message: "Failed to load progress" });
  }
};

// ─── Bookmarks ─────────────────────────────────────────────────────────────

// POST /users/me/bookmarks
// Body: { lectureId, courseId, chapterId?, title?, note? }
export const addBookmark = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lectureId, courseId, chapterId = null, title = "", note = "" } = req.body || {};
    if (!lectureId || !courseId || !mongoose.isValidObjectId(lectureId) || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Valid lectureId and courseId are required" });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Idempotent — same lecture only once
    const exists = (user.bookmarks || []).some(b => b.lectureId?.toString() === lectureId);
    if (exists) return res.json({ ok: true, alreadyBookmarked: true });

    // Cap at 500 to bound the doc size
    if ((user.bookmarks || []).length >= 500) {
      return res.status(400).json({ message: "Bookmark limit reached (500). Remove some first." });
    }

    user.bookmarks.push({
      lectureId, courseId,
      chapterId: chapterId && mongoose.isValidObjectId(chapterId) ? chapterId : null,
      title: String(title).slice(0, 200),
      note:  String(note).slice(0, 500),
      createdAt: new Date(),
    });
    await user.save();
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("addBookmark error:", err);
    return res.status(500).json({ message: "Failed to add bookmark" });
  }
};

// DELETE /users/me/bookmarks/:lectureId
export const removeBookmark = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lectureId } = req.params;
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lectureId" });
    }
    await User.updateOne(
      { _id: userId },
      { $pull: { bookmarks: { lectureId } } }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("removeBookmark error:", err);
    return res.status(500).json({ message: "Failed to remove bookmark" });
  }
};

// GET /users/me/bookmarks
// Returns: list of bookmarks with course name attached
export const listBookmarks = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate("bookmarks.courseId", "name slug")
      .populate("bookmarks.lectureId", "title kind thumbnailUrl youtubeId durationSec")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    const items = (user.bookmarks || [])
      .filter(b => b.lectureId) // drop bookmarks whose lecture was deleted
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(items);
  } catch (err) {
    console.error("listBookmarks error:", err);
    return res.status(500).json({ message: "Failed to load bookmarks" });
  }
};

// ─── Certificates ──────────────────────────────────────────────────────────

// Internal — fingerprint a certificate so re-issuing the same course produces the same number.
function buildCertNumber(userId, courseId) {
  return "JG-" + crypto.createHash("sha1")
    .update(`${userId}:${courseId}`)
    .digest("hex").slice(0, 10).toUpperCase();
}

// POST /users/me/certificates/:courseId/issue
// Idempotent. Requires the user to have completedLessons === totalLessons (>0).
export const issueCertificate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Already issued?
    const existing = (user.certificates || []).find(c => c.courseId?.toString() === courseId);
    if (existing) return res.json({ ok: true, certificate: existing, alreadyIssued: true });

    const pc = user.paidCourses.find(p => p.courseId?.toString() === courseId);
    if (!pc || !pc.isPaid) return res.status(403).json({ message: "Course access required" });

    // Verify 100% completion (recount on demand so a stale totalLessons can't block)
    const chapters = await Chapter.find({ courseId }).select("_id").lean();
    const total = chapters.length
      ? await Lecture.countDocuments({ chapterId: { $in: chapters.map(c => c._id) }, deletedAt: null })
      : 0;
    const completed = (pc.completedLectureIds || []).length;
    if (total === 0 || completed < total) {
      return res.status(403).json({
        message: "Complete all lectures to earn the certificate.",
        completed, total,
      });
    }

    const course = await Course.findById(courseId).select("name").lean();
    const cert = {
      courseId,
      courseName: course?.name || "",
      certNumber: buildCertNumber(userId, courseId),
      issuedAt:   new Date(),
    };
    user.certificates.push(cert);
    await user.save();
    return res.status(201).json({ ok: true, certificate: cert });
  } catch (err) {
    console.error("issueCertificate error:", err);
    return res.status(500).json({ message: "Failed to issue certificate" });
  }
};

// GET /users/me/certificates
export const listCertificates = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("certificates f_name last_name").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({
      studentName: `${user.f_name} ${user.last_name}`.trim(),
      certificates: (user.certificates || []).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt)),
    });
  } catch (err) {
    console.error("listCertificates error:", err);
    return res.status(500).json({ message: "Failed to load certificates" });
  }
};


// ═══════════════════════════════════════════════════════════════════════
// Platform handle (Instagram-style username)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/users/handle-available?h=some_handle
// Public. Returns { available: true|false, reason?: string }.
export const isHandleAvailable = async (req, res) => {
  try {
    const raw  = String(req.query.h || "").trim().toLowerCase();
    const norm = normalizeHandle(raw);
    if (!raw) return res.status(400).json({ available: false, reason: "Missing handle" });
    if (norm !== raw) return res.status(200).json({ available: false, reason: "Only lowercase letters, digits, _ and . allowed" });
    if (norm.length < 3 || norm.length > 24) {
      return res.status(200).json({ available: false, reason: "Must be 3–24 characters" });
    }
    const exists = await User.exists({ handle: norm });
    return res.json({ available: !exists });
  } catch (err) {
    console.error("isHandleAvailable error:", err);
    return res.status(500).json({ available: false, reason: "Server error" });
  }
};

// PATCH /api/users/me/handle  { handle }
// Auth required. Sets or changes the current user's handle. Uniqueness is
// enforced by the unique index — we handle the E11000 gracefully.
export const setMyHandle = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const wanted = normalizeHandle(req.body?.handle);
    if (wanted.length < 3) return res.status(400).json({ message: "Handle must be at least 3 characters" });
    const user = await User.findById(userId).select("handle f_name last_name");
    if (!user) return res.status(404).json({ message: "User not found" });
    user.handle = wanted;
    try {
      await user.save();
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: "That handle is already taken" });
      throw e;
    }
    return res.json({ handle: user.handle });
  } catch (err) {
    console.error("setMyHandle error:", err);
    return res.status(500).json({ message: "Failed to set handle" });
  }
};
