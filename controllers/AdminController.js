// controllers/adminController.js
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/validateEnv.js";
import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import TestResult from "../models/TestResult.js";

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
    { sub: admin._id.toString(), role: "admin", ver: admin.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

const signRefreshToken = (admin) =>
  jwt.sign(
    { sub: admin._id.toString(), role: "admin", ver: admin.tokenVersion || 0 },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );

const setRefreshCookie = (res, token) => {
  res.cookie("adminRefreshToken", token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/admin/refresh",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

/* ------------------ HELPERS ------------------ */
const formatUserForCourse = (user, courseId) => {
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
};
// ==========================
// LOGIN ADMIN
// ==========================
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email }).select("+password +tokenVersion");
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = signAccessToken(admin);
    const refreshToken = signRefreshToken(admin);
    setRefreshCookie(res, refreshToken);

    res.json({
      message: "Admin login successful",
      accessToken,
      role: "admin",
      admin: {
        id: admin._id,
        email: admin.email,
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
    const admin = await Admin.findById(payload.sub);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (payload.ver !== (admin.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked" });
    }

     const accessToken = signAccessToken(admin);
    return res.json({
      accessToken,
      role: "admin",
      user: { id: admin._id, email: admin.email },
    });
  } catch (err) {
    console.error("Admin refresh error:", err);
    res.status(403).json({ message: "Invalid refresh token" });
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
      path: "/api/admin/refresh", // must match setRefreshCookie
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
      // Get users either enrolled or paid for this course
      const users = await User.find({
        $or: [
          { enrolledCourses: courseId },
          { "paidCourses.courseId": courseId }
        ]
      }).select("f_name last_name whatsappNo district enrolledCourses paidCourses");

      const formatted = users.map(u => formatUserForCourse(u, courseId));
      return res.status(200).json(formatted);
    }

    // Otherwise: return all verified users with minimal info
    const users = await User.find({ verified: true })
      .select("f_name last_name whatsappNo district");

    const data = users.map(u => ({
      userId: u._id,
      name: `${u.f_name} ${u.last_name}`.trim(),
      whatsappNo: u.whatsappNo,
      district: u.district
    }));

    res.status(200).json(data);
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

    // Global: return all users who have at least one active paid course
    const users = await User.find({
      verified: true,
      paidCourses: { $elemMatch: { isPaid: true } }
    }).select("f_name last_name whatsappNo district paidCourses");

    const data = users.map(u => ({
      userId: u._id,
      name: `${u.f_name} ${u.last_name}`.trim(),
      whatsappNo: u.whatsappNo,
      district: u.district,
      paidCourses: u.paidCourses.filter(pc => pc.isPaid)
    }));

    res.status(200).json(data);
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


