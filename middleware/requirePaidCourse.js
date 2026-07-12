// middleware/requirePaidCourse.js
//
// Gate that runs AFTER `protect`. Looks up the user's paidCourses[] entry for
// the courseId we're trying to access. Returns 402 (Payment Required) if not
// paid. Free courses (priceINR === 0) are always allowed.
//
// Usage:
//   router.post("/submit", protect, requirePaidCourse, submitTest)
//
// The courseId is pulled from (in order): params.courseId, body.courseId, query.courseId.

import User   from "../models/User.js";
import Course from "../models/Course.js";
import mongoose from "mongoose";

export const requirePaidCourse = async (req, res, next) => {
  try {
    // Any admin/tutor session bypasses the payment gate. Developer accounts
    // never reach admin routes (verifyAdmin rejects them), so they aren't
    // considered here.
    if (req.admin) return next();
    const role = req.user?.role;
    if (role === "admin" || role === "tutor") return next();

    const courseId =
      req.params?.courseId ||
      req.body?.courseId   ||
      req.query?.courseId;

    // No courseId — nothing to gate on, pass through
    if (!courseId) return next();

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select("priceINR status validityDays").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Always allow if course is free
    if (!course.priceINR || course.priceINR <= 0) return next();

    // Block draft courses for non-admin users
    if (course.status === "draft") {
      return res.status(404).json({ message: "Course not available" });
    }

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await User.findById(userId).select("paidCourses").lean();
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const paidEntry = (user.paidCourses || []).find(
      (pc) => pc.courseId?.toString() === String(courseId) && pc.isPaid === true
    );

    // Check validity expiry
    let hasAccess = !!paidEntry;
    if (paidEntry && course.validityDays && paidEntry.paidAt) {
      const expiry = new Date(paidEntry.paidAt);
      expiry.setDate(expiry.getDate() + course.validityDays);
      if (new Date() > expiry) hasAccess = false;
    }

    if (!hasAccess) {
      return res.status(402).json({
        message:  "Paid access required for this course.",
        upgrade:  true,
        courseId,
      });
    }

    return next();
  } catch (err) {
    console.error("requirePaidCourse error:", err);
    return res.status(500).json({ message: "Access check failed" });
  }
};
