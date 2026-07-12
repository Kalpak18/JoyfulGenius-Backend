// controllers/adminController.js
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/validateEnv.js";
import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import TestResult from "../models/TestResult.js";
import sendEmail, { buildPasswordResetEmail } from "../Utils/sendEmail.js";

const { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } = env;

const toObjectId = (id) => new mongoose.Types.ObjectId(id);


const isProd = NODE_ENV === "production";
const sameSite = isProd ? "none" : "lax";
const secure = isProd;

// ==========================
// TOKEN HELPERS
// ==========================
const signAccessToken = (admin) =>
  jwt.sign(
    { sub: admin._id.toString(), role: admin.role, ver: admin.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

const signRefreshToken = (admin) =>
  jwt.sign(
    { sub: admin._id.toString(), role: admin.role, ver: admin.tokenVersion || 0 },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );

// Cookie scoped to /api/admin so the browser only ever sends it to admin
// refresh. Developer sessions use a completely separate cookie
// (developerRefreshToken, path /api/developer) — see developerController.js.
const setRefreshCookie = (res, token) => {
  res.cookie("adminRefreshToken", token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/admin",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

/* ------------------ HELPERS ------------------ */
const formatUserForCourse = (user, courseId) => {
  const paidCourse = user.paidCourses.find(
    pc => pc.courseId && pc.courseId.toString() === courseId
  );
  const isPaid = !!(paidCourse?.isPaid);
  return {
    userId:      user._id,
    handle:      user.handle || null,
    name:        `${user.f_name} ${user.last_name}`.trim(),
    whatsappNo:  user.whatsappNo,
    district:    user.district,
    status:      isPaid ? "Paid" : "Enrolled",
    isPaid,
    paidAt:      isPaid ? paidCourse.paidAt : null,
    progress:    isPaid ? paidCourse.progress || { completedLessons: 0, totalLessons: 0 } : null,
    testResults: isPaid ? paidCourse.testResults || [] : [],
  };
};
// NOTE: Developer registration and login have moved to
// controllers/developerController.js and /api/developer/*. The admin
// controller no longer knows anything about the "developer" role.

// NOTE: createAdmin / listAdmins / updateAdminScope / deleteAdmin used to live
// here as developer-only helpers. They have moved to
// controllers/developerController.js and are exposed at /api/developer/admins.
// The admin controller no longer knows or references those operations.

/* =========================================================================
   OWNED-TUTORS — endpoints an admin (course owner) uses to manage tutors
   that belong to their own courses.
========================================================================= */

async function ownedCourseIdSet(adminId) {
  const owned = await Course.find({ createdBy: adminId }).select("_id").lean();
  return new Set(owned.map(c => c._id.toString()));
}

function pruneScopeToOwned(rawIds, ownedSet) {
  if (!Array.isArray(rawIds)) return [];
  return rawIds.filter(id => mongoose.isValidObjectId(id) && ownedSet.has(id.toString()));
}

function pruneSubjectScopesToOwned(raw, ownedSet) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(e => e?.courseId && ownedSet.has(e.courseId.toString()))
    .map(e => ({
      courseId: e.courseId,
      subjectIds: Array.isArray(e.subjectIds)
        ? [...new Set(e.subjectIds.filter(s => mongoose.isValidObjectId(s)).map(String))]
        : [],
    }));
}

export const createOwnedTutor = async (req, res) => {
  try {
    if (req.admin.role !== "admin") {
      return res.status(403).json({ message: "Only course owners can create tutors." });
    }
    const { email, password, name, scopedCourseIds, subjectScopes } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
    if (password.length < 6)  return res.status(400).json({ message: "Password must be at least 6 characters" });

    const ownedSet = await ownedCourseIdSet(req.admin._id);
    if (ownedSet.size === 0) {
      return res.status(400).json({ message: "You must create a course before adding tutors." });
    }

    const scoped = pruneScopeToOwned(scopedCourseIds, ownedSet);
    if (scoped.length === 0) {
      return res.status(400).json({ message: "Pick at least one of your courses for this tutor." });
    }

    const tutor = await Admin.create({
      email: email.toLowerCase().trim(),
      password,
      name: name?.trim() || "",
      role: "tutor",
      scopedCourseIds: scoped,
      subjectScopes:   pruneSubjectScopesToOwned(subjectScopes, ownedSet),
    });

    return res.status(201).json({
      message: "Tutor created.",
      tutor: {
        id: tutor._id, email: tutor.email, name: tutor.name, role: tutor.role,
        scopedCourseIds: tutor.scopedCourseIds,
        subjectScopes:   tutor.subjectScopes,
      },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "This email is already registered." });
    console.error("createOwnedTutor error:", err);
    return res.status(500).json({ message: "Server error creating tutor" });
  }
};

// Lists tutors who touch at least one of the caller's courses.
export const listOwnedTutors = async (req, res) => {
  try {
    if (req.admin.role !== "admin") return res.json([]);
    const ownedSet = await ownedCourseIdSet(req.admin._id);
    if (ownedSet.size === 0) return res.json([]);

    const ownedIds = [...ownedSet].map(id => new mongoose.Types.ObjectId(id));
    const tutors = await Admin.find({
      role: "tutor",
      scopedCourseIds: { $in: ownedIds },
    })
      .select("email name role scopedCourseIds subjectScopes createdAt")
      .populate("scopedCourseIds",         "name slug")
      .populate("subjectScopes.courseId",  "name slug")
      .populate("subjectScopes.subjectIds", "name")
      .sort({ createdAt: 1 })
      .lean();
    return res.json(tutors);
  } catch (err) {
    console.error("listOwnedTutors error:", err);
    return res.status(500).json({ message: "Failed to list tutors" });
  }
};

export const updateOwnedTutor = async (req, res) => {
  try {
    if (req.admin.role !== "admin") return res.status(403).json({ message: "Only course owners can update tutors." });
    const target = await Admin.findById(req.params.id);
    if (!target || target.role !== "tutor") return res.status(404).json({ message: "Tutor not found" });

    const ownedSet = await ownedCourseIdSet(req.admin._id);
    // Caller must own at least one course this tutor already touches
    const touchesMine = (target.scopedCourseIds || []).some(id => ownedSet.has(id.toString()));
    if (!touchesMine) return res.status(403).json({ message: "This tutor doesn't belong to you." });

    const { scopedCourseIds, subjectScopes, name } = req.body || {};

    if (typeof name === "string") target.name = name.trim();

    if (Array.isArray(scopedCourseIds)) {
      // Preserve any course scopes that belong to OTHER admins (don't wipe out
      // another owner's assignment). Then merge in the caller's pruned set.
      const preserved = (target.scopedCourseIds || []).filter(id => !ownedSet.has(id.toString()));
      const pruned    = pruneScopeToOwned(scopedCourseIds, ownedSet);
      target.scopedCourseIds = [...preserved, ...pruned];
    }
    if (Array.isArray(subjectScopes)) {
      const preservedScopes = (target.subjectScopes || []).filter(s => !ownedSet.has((s.courseId?._id || s.courseId).toString()));
      const prunedScopes    = pruneSubjectScopesToOwned(subjectScopes, ownedSet);
      target.subjectScopes  = [...preservedScopes, ...prunedScopes];
    }
    target.tokenVersion = (target.tokenVersion || 0) + 1;
    await target.save();

    return res.json({
      id: target._id, email: target.email, name: target.name, role: target.role,
      scopedCourseIds: target.scopedCourseIds,
      subjectScopes:   target.subjectScopes,
    });
  } catch (err) {
    console.error("updateOwnedTutor error:", err);
    return res.status(500).json({ message: "Failed to update tutor" });
  }
};

export const deleteOwnedTutor = async (req, res) => {
  try {
    if (req.admin.role !== "admin") return res.status(403).json({ message: "Only course owners can delete tutors." });
    const target = await Admin.findById(req.params.id);
    if (!target || target.role !== "tutor") return res.status(404).json({ message: "Tutor not found" });

    const ownedSet = await ownedCourseIdSet(req.admin._id);
    // Strip the caller's course scopes from this tutor first
    const remainingCourses = (target.scopedCourseIds || []).filter(id => !ownedSet.has(id.toString()));
    const remainingScopes  = (target.subjectScopes  || []).filter(s => !ownedSet.has((s.courseId?._id || s.courseId).toString()));

    if (remainingCourses.length === (target.scopedCourseIds || []).length) {
      return res.status(403).json({ message: "This tutor doesn't belong to you." });
    }

    if (remainingCourses.length === 0) {
      // No other admin uses this tutor — safe to delete the account
      await Admin.findByIdAndDelete(target._id);
      return res.json({ message: "Tutor deleted." });
    }
    // Another admin still uses this tutor — just detach ours
    target.scopedCourseIds = remainingCourses;
    target.subjectScopes   = remainingScopes;
    target.tokenVersion    = (target.tokenVersion || 0) + 1;
    await target.save();
    return res.json({ message: "Tutor detached from your courses." });
  } catch (err) {
    console.error("deleteOwnedTutor error:", err);
    return res.status(500).json({ message: "Failed to delete tutor" });
  }
};

// POST /api/admin/login
// Accepts admin + tutor accounts. Rejects anyone whose role isn't admin/tutor
// (developer signs in on the separate /api/developer surface).
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email: (email || "").toLowerCase().trim() })
      .select("+password +tokenVersion");
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    if (admin.role !== "admin" && admin.role !== "tutor") {
      return res.status(403).json({
        error: "This account cannot sign in here.",
        redirect: admin.role === "developer" ? "/developer/login" : null,
      });
    }

    const accessToken  = signAccessToken(admin);
    const refreshToken = signRefreshToken(admin);
    setRefreshCookie(res, refreshToken);
    return res.json({
      message: "Login successful",
      accessToken,
      role: admin.role,
      user: {
        id:    admin._id,
        email: admin.email,
        name:  admin.name || "",
        role:  admin.role,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error during admin login" });
  }
};

// ==========================
// REFRESH ADMIN ACCESS TOKEN
// ==========================
export const refreshAdminAccessToken = async (req, res) => {
  const token = req.cookies.adminRefreshToken;
  if (!token) return res.status(401).json({ message: "No refresh token" });

  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    // Admin refresh serves admin + tutor only. Developer refresh is on /api/developer.
    if (payload.role !== "admin" && payload.role !== "tutor") {
      return res.status(403).json({ message: "Wrong role for this endpoint" });
    }
    const admin = await Admin.findById(payload.sub);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (payload.ver !== (admin.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked" });
    }

    const accessToken = signAccessToken(admin);
    return res.json({
      accessToken,
      role: admin.role,
      user: { id: admin._id, email: admin.email, name: admin.name || "", role: admin.role },
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

// ==========================
// LOGOUT ADMIN
// ==========================
export const logoutAdmin = async (req, res) => {
  try {
      if (req.admin?._id) {
      await Admin.findByIdAndUpdate(req.admin._id, {
        $inc: { tokenVersion: 1 },
      });
    }
    res.clearCookie("adminRefreshToken", {
      httpOnly: true,
      secure,
      sameSite,
      path: "/api/admin", // must match setRefreshCookie
    });
    res.json({ message: "Admin logged out" });
     } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Error during logout" });
  }
};


/* ------------------ HELPERS ------------------ */
const fullName = (u) => `${u.f_name} ${u.last_name}`.trim();

/* 
  IMPORTANT: Your User.paidCourses structure appears to be [{ courseId: ObjectId }, ...].
  The queries below use $elemMatch on { courseId }.
*/

/* ------------------ USERS: ALL / PAID (GLOBAL or BY COURSE) ------------------ */
export const getAllUsers = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (courseId) {
      // Explicit course filter → return users enrolled/paid in that specific course.
      const users = await User.find({
        $or: [
          { enrolledCourses: courseId },
          { "paidCourses.courseId": courseId }
        ]
      }).select("f_name last_name whatsappNo district enrolledCourses paidCourses");

      const formatted = users.map(u => formatUserForCourse(u, courseId));
      return res.status(200).json(formatted);
    }

    // No courseId → scope to the caller's courses.
    // - Admin: users enrolled/paid in any course they own.
    // - Tutor: users enrolled/paid in any course in their scope.
    // We never return every user on the platform; that's a leak of other
    // admins' students to this one.
    let allowedCourseIds = null;
    if (req.admin?.role === "admin") {
      // Match courses this admin created. Also include courses with no createdBy
      // (legacy data created before the field existed — only one admin, so safe).
      const owned = await Course.find({
        $or: [
          { createdBy: req.admin._id },
          { createdBy: { $exists: false } },
          { createdBy: null },
        ]
      }).select("_id").lean();
      allowedCourseIds = owned.map(c => c._id);
    } else if (req.admin?.role === "tutor") {
      allowedCourseIds = (req.admin.scopedCourseIds || []);
    }

    if (!Array.isArray(allowedCourseIds) || allowedCourseIds.length === 0) {
      return res.status(200).json([]);
    }

    const users = await User.find({
      verified: true,
      $or: [
        { enrolledCourses: { $in: allowedCourseIds } },
        { "paidCourses.courseId": { $in: allowedCourseIds } },
      ],
    }).select("f_name last_name whatsappNo district");

    const data = users.map(u => ({
      userId: u._id,
      name: `${u.f_name} ${u.last_name}`.trim(),
      whatsappNo: u.whatsappNo,
      district: u.district
    }));

    return res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Error fetching users" });
  }
};


export const getPaidUsers = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (courseId) {
      // Paid users for a specific course
      const users = await User.find({
        verified: true,
        paidCourses: { $elemMatch: { courseId: toObjectId(courseId), isPaid: true } }
      }).select("f_name last_name whatsappNo district paidCourses");

      const formatted = users.map(u => formatUserForCourse(u, courseId));
      return res.status(200).json(formatted);
    }

    // No courseId → scope to caller's own courses. Same rule as getAllUsers:
    // never leak paid users from courses this admin doesn't own.
    let allowedCourseIds = null;
    if (req.admin?.role === "admin") {
      const owned = await Course.find({ createdBy: req.admin._id }).select("_id").lean();
      allowedCourseIds = owned.map(c => c._id);
    } else if (req.admin?.role === "tutor") {
      allowedCourseIds = (req.admin.scopedCourseIds || []);
    }
    if (!Array.isArray(allowedCourseIds) || allowedCourseIds.length === 0) {
      return res.status(200).json([]);
    }

    const users = await User.find({
      verified: true,
      paidCourses: { $elemMatch: { isPaid: true, courseId: { $in: allowedCourseIds } } }
    }).select("f_name last_name whatsappNo district paidCourses");

    const data = users.map(u => ({
      userId: u._id,
      name: `${u.f_name} ${u.last_name}`.trim(),
      whatsappNo: u.whatsappNo,
      district: u.district,
      paidCourses: u.paidCourses.filter(pc =>
        pc.isPaid && allowedCourseIds.some(id => id.toString() === pc.courseId?.toString())
      ),
    }));

    return res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching paid users:", err);
    res.status(500).json({ message: "Error fetching paid users" });
  }
};

/* ------------------ UPDATE / DELETE USER ------------------ */
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { f_name, last_name, whatsappNo, district } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { f_name, last_name, whatsappNo, district },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      message: "User updated successfully",
      user: {
        userId: user._id,
        name: `${user.f_name} ${user.last_name}`.trim(),
        whatsappNo: user.whatsappNo,
        district: user.district
      }
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: "Server error during update" });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const u = await User.findByIdAndDelete(id);
    if (!u) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Server error during deletion" });
  }
};

/* ------------------ ADMIN STATS (GLOBAL or BY COURSE) ------------------ */
export const getAdminStats = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (courseId) {
      const course = await Course.findById(courseId).select("enrolledUsers");
      if (!course) return res.status(404).json({ message: "Course not found" });

      const totalUsers = course.enrolledUsers.length;

      const paidUsers = await User.countDocuments({
        _id: { $in: course.enrolledUsers },
        paidCourses: { $elemMatch: { courseId: toObjectId(courseId), isPaid: true } }
      });
      const unpaidUsers = totalUsers - paidUsers;

      // Tests count
      let totalTests = 0;
      try {
        const hasCourseField = await TestResult.exists({ course: toObjectId(courseId) });
        if (hasCourseField) {
          totalTests = await TestResult.countDocuments({ course: toObjectId(courseId) });
        } else {
          totalTests = await TestResult.countDocuments({ user: { $in: course.enrolledUsers } });
        }
      } catch {
        totalTests = await TestResult.countDocuments({ user: { $in: course.enrolledUsers } });
      }

      // Subject distribution
      const subjectStats = await TestResult.aggregate([
        { $match: { user: { $in: course.enrolledUsers } } },
        { $group: { _id: "$subject", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      // Top scorers
      const topScorers = await TestResult.aggregate([
        { $match: { user: { $in: course.enrolledUsers } } },
        {
          $group: {
            _id: "$user",
            avgScore: { $avg: { $divide: ["$score", "$total"] } }
          }
        },
        { $sort: { avgScore: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userDetails"
          }
        },
        { $unwind: "$userDetails" },
        {
          $project: {
            name: { $concat: ["$userDetails.f_name", " ", "$userDetails.last_name"] },
            district: "$userDetails.district",
            avgScore: { $round: [{ $multiply: ["$avgScore", 100] }, 1] }
          }
        }
      ]);

      // District stats
      const districtStats = await User.aggregate([
        { $match: { _id: { $in: course.enrolledUsers } } },
        { $group: { _id: "$district", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      return res.json({
        scopedToCourse: courseId,
        totalUsers,
        paidUsers,
        unpaidUsers,
        totalTests,
        subjectStats,
        topScorers,
        districtStats
      });
    }

    // Global stats
    const totalUsers = await User.countDocuments({ verified: true });
    const paidUsers = await User.countDocuments({
      verified: true,
      paidCourses: { $elemMatch: { isPaid: true } }
    });
    const unpaidUsers = totalUsers - paidUsers;
    const totalTests = await TestResult.countDocuments();

    const subjectStats = await TestResult.aggregate([
      { $group: { _id: "$subject", count: { $sum: 1 } } }
    ]);

    const topScorers = await TestResult.aggregate([
      { $group: { _id: "$user", avgScore: { $avg: { $divide: ["$score", "$total"] } } } },
      { $sort: { avgScore: -1 } },
      { $limit: 5 },
      {
        $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "userDetails" }
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          name: { $concat: ["$userDetails.f_name", " ", "$userDetails.last_name"] },
          district: "$userDetails.district",
          avgScore: { $round: [{ $multiply: ["$avgScore", 100] }, 1] }
        }
      }
    ]);

    const districtStats = await User.aggregate([
      { $group: { _id: "$district", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      totalUsers,
      paidUsers,
      unpaidUsers,
      totalTests,
      subjectStats,
      topScorers,
      districtStats
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
};

// ==========================
// FORGOT ADMIN PASSWORD
// ==========================
export const forgotAdminPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    // Always respond OK — don't leak whether email exists
    if (!admin) return res.json({ message: "If that email is registered, a reset link has been sent." });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed   = crypto.createHash("sha256").update(rawToken).digest("hex");

    admin.passwordResetToken   = hashed;
    admin.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await admin.save();

    const resetUrl = `${env.FRONTEND_URL}/admin/reset-password/${rawToken}`;
    const html     = buildPasswordResetEmail(resetUrl, "Admin");
    await sendEmail(admin.email, "Reset your JoyfulGenius admin password", `Reset link: ${resetUrl}`, html);

    return res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    console.error("forgotAdminPassword error:", err);
    return res.status(500).json({ message: "Failed to send reset email. Try again later." });
  }
};

// ==========================
// RESET ADMIN PASSWORD
// ==========================
export const resetAdminPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const admin = await Admin.findOne({
      passwordResetToken:   hashed,
      passwordResetExpires: { $gt: new Date() },
    }).select("+password +tokenVersion");

    if (!admin) return res.status(400).json({ message: "Reset link is invalid or has expired." });

    admin.password             = password; // pre-save hook hashes it
    admin.passwordResetToken   = null;
    admin.passwordResetExpires = null;
    admin.tokenVersion         = (admin.tokenVersion || 0) + 1; // invalidate existing sessions
    await admin.save();

    return res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("resetAdminPassword error:", err);
    return res.status(500).json({ message: "Failed to reset password." });
  }
};

/* ------------------ USER TEST RESULTS ------------------ */
export const getUserTestResults = async (req, res) => {
  const { userId } = req.params;
  try {
    const results = await TestResult.find({ user: userId }).sort({ createdAt: -1 });
    res.json(results);
  } catch (error) {
    console.error("Error fetching user's test results:", error);
    res.status(500).json({ message: "Failed to fetch user results" });
  }
};


