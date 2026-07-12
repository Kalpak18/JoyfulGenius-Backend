// controllers/CourseController.js
import mongoose from "mongoose";
import Course, { slugify } from "../models/Course.js";
import User       from "../models/User.js";
import Chapter    from "../models/chapter.js";
import Subject    from "../models/subject.js";
import Lecture    from "../models/Lecture.js";
import Question   from "../models/question.js";
import TestBundle from "../models/TestBundle.js";
import Assignment from "../models/Assignment.js";
import { scopeCourseListFilter } from "../middleware/tutorScope.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// Fields admin can set on create/update
const COURSE_WRITE_FIELDS = [
  "name", "slug", "description", "language",
  "thumbnailUrl", "priceINR", "discountINR", "discountPercent",
  "status", "validityDays", "hasPlayer", "courseType",
];

// Make sure slug is unique; append -2, -3, ... if needed.
async function ensureUniqueSlug(base, excludeId = null) {
  const slug = base || "course";
  let n = 1;
  while (true) {
    const candidate = n === 1 ? slug : `${slug}-${n}`;
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Course.findOne(q).select("_id").lean();
    if (!exists) return candidate;
    n++;
    if (n > 200) throw new Error("Could not find a unique slug");
  }
}

/* ===========================
   POST /api/courses
   Auth: verifyAdmin
=========================== */
export const createCourse = async (req, res) => {
  try {
    // Only admin role can create courses. Developers manage accounts, not
    // content. Tutors work inside courses others own.
    if (req.admin?.role !== "admin") {
      return res.status(403).json({
        message: req.admin?.role === "developer"
          ? "Developers manage accounts, not course content. Log in as an admin to create a course."
          : "Tutors can't create courses. Ask the course owner.",
      });
    }

    const data = {};
    for (const k of COURSE_WRITE_FIELDS) if (k in req.body) data[k] = req.body[k];

    if (!data.name) return res.status(400).json({ message: "name is required" });

    const baseSlug = slugify(data.slug || data.name);
    data.slug = await ensureUniqueSlug(baseSlug);

    if (data.priceINR != null) data.priceINR = Number(data.priceINR);
    if (data.validityDays === "" || data.validityDays == null) data.validityDays = null;

    data.createdBy = req.admin._id;
    data.updatedBy = req.admin._id;

    const course = await Course.create(data);
    return res.status(201).json(course);
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ message: err.message || "Failed to create course" });
  }
};

/* ===========================
   PUT /api/courses/:courseId
   Auth: verifyAdmin
=========================== */
export const updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid id" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    for (const k of COURSE_WRITE_FIELDS) if (k in req.body) course[k] = req.body[k];

    // Re-slug if slug was explicitly set or name changed without a slug
    if (req.body.slug || (req.body.name && !req.body.slug)) {
      const base = slugify(req.body.slug || req.body.name);
      course.slug = await ensureUniqueSlug(base, course._id);
    }

    if (req.body.priceINR != null) course.priceINR = Number(req.body.priceINR);
    if (req.body.validityDays === "" || req.body.validityDays === null) course.validityDays = null;

    course.updatedBy = req.admin?._id;
    await course.save();
    return res.json(course);
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ message: err.message || "Failed to update course" });
  }
};

/* ===========================
   GET /api/courses/public  — no auth required
   GET /api/courses          — auth required (same data, kept for back-compat)
=========================== */
export const getPublicCourses = async (req, res) => {
  try {
    const courses = await Course.find({ status: "published" })
      .select("_id name slug description language thumbnailUrl courseType priceINR discountINR discountPercent hasPlayer")
      .sort({ createdAt: -1 });
    return res.status(200).json(courses);
  } catch (err) {
    console.error("Get public courses error:", err);
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
};

export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find({ status: "published" }).sort({ createdAt: -1 });
    return res.status(200).json({ message: "Courses fetched", data: courses });
  } catch (err) {
    console.error("Get courses error:", err);
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
};

/* ===========================
   GET /api/courses/admin/list
   Auth: verifyAdmin — includes drafts + archived
=========================== */
export const listCoursesForAdmin = async (req, res) => {
  try {
    // Admins see their own courses (createdBy match).
    // Tutors see courses in scopedCourseIds.
    // Developers see nothing (they don't manage course content).
    const filter = scopeCourseListFilter(req.admin);
    const courses = await Course.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ data: courses });
  } catch (err) {
    console.error("listCoursesForAdmin error:", err);
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
};

/* ===========================
   POST /api/courses/visit-course
=========================== */
export const enrollUser = async (req, res) => {
  try {
    const { courseId, userId } = req.body;
    const course = await Course.findById(courseId).select("_id enrolledUsers").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Track visit on the course doc only — do NOT add to user.paidCourses with isPaid:false
    // (that array is payment-only; mixing visit-tracking in it causes false negatives in access checks)
    const alreadyTracked = course.enrolledUsers?.some(id => id.toString() === userId);
    if (!alreadyTracked) {
      await Course.updateOne(
        { _id: courseId },
        { $addToSet: { enrolledUsers: userId } }
      );
    }
    return res.status(200).json({ message: "Visit tracked" });
  } catch (err) {
    console.error("Enroll user error:", err);
    return res.status(500).json({ message: "Failed to track visit" });
  }
};

/* ===========================
   DELETE /api/courses/:courseId
   Cascades subjects, chapters, lectures.
=========================== */
export const deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid id" });

    const course = await Course.findByIdAndDelete(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const oid = toObjectId(courseId);
    await Promise.all([
      Chapter.deleteMany({ courseId: oid }),
      Subject.deleteMany({ courseId: oid }),
      Question.deleteMany({ courseId: oid }),
      TestBundle.deleteMany({ courseId: oid }),
      Assignment.deleteMany({ courseId: oid }),
      Lecture.updateMany({ courseId: oid }, { $set: { deletedAt: new Date() } }),
    ]);

    return res.status(200).json({ message: "Course and related content deleted" });
  } catch (err) {
    console.error("Delete course error:", err.message || err);
    return res.status(500).json({ message: "Failed to delete course", error: err.message });
  }
};

/* ===========================
   GET /api/courses/user/courses
=========================== */
export const getCoursesForUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { order } = req.body;
    let courses;
    if (Array.isArray(order) && order.length > 0) {
      const fetched = await Course.find({ name: { $in: order }, status: "published" });
      courses = order.map(n => fetched.find(c => c.name === n)).filter(Boolean);
    } else {
      courses = await Course.find({ status: "published" }).sort({ createdAt: -1 });
    }

    const out = courses.map(course => {
      const paidInfo = user.paidCourses.find(pc => pc.courseId.toString() === course._id.toString());
      return {
        _id:             course._id,
        name:            course.name,
        slug:            course.slug,
        description:     course.description,
        language:        course.language,
        thumbnailUrl:    course.thumbnailUrl,
        priceINR:        course.priceINR,
        discountINR:     course.discountINR ?? 0,
        discountPercent: course.discountPercent ?? 0,
        status:          course.status,
        hasPlayer:       course.hasPlayer !== false,
        courseType:      course.courseType,
        isPaid:          paidInfo?.isPaid || false,
        paidAt:          paidInfo?.paidAt || null,
      };
    });

    return res.status(200).json({ message: "Courses fetched", data: out });
  } catch (err) {
    console.error("Get courses for user error:", err);
    return res.status(500).json({ message: "Failed to fetch courses" });
  }
};

/* ===========================
   GET /api/courses/user/course/:slugOrName
=========================== */
export const getCourseByNameForUser = async (req, res) => {
  try {
    const { coursename } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const course = await Course.findOne({
      $or: [{ slug: coursename.toLowerCase() }, { name: coursename.trim() }],
    });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const paidInfo = user.paidCourses.find(pc => pc.courseId.toString() === course._id.toString());
    return res.status(200).json({
      _id:             course._id,
      name:            course.name,
      slug:            course.slug,
      description:     course.description,
      language:        course.language,
      thumbnailUrl:    course.thumbnailUrl,
      priceINR:        course.priceINR,
      discountINR:     course.discountINR ?? 0,
      discountPercent: course.discountPercent ?? 0,
      hasPlayer:       course.hasPlayer !== false,
      courseType:      course.courseType,
      isPaid:          !!paidInfo?.isPaid,
      paidAt:          paidInfo?.paidAt || null,
    });
  } catch (err) {
    console.error("Get course by name error:", err);
    return res.status(500).json({ message: "Failed to fetch course" });
  }
};

/* ===========================
   GET /api/courses/:courseId/access
   Auth: protect
   Returns fresh server-side access status so frontend never relies on
   stale localStorage for the paywall decision.
=========================== */
export const getCourseAccess = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const [course, user] = await Promise.all([
      Course.findById(courseId)
        .select("name slug description language thumbnailUrl priceINR discountINR discountPercent status courseType validityDays hasPlayer")
        .lean(),
      User.findById(req.user.id).select("paidCourses").lean(),
    ]);

    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!user)   return res.status(401).json({ message: "User not found" });

    if (course.status === "draft") {
      return res.status(404).json({ message: "Course not available" });
    }

    const isFree = !course.priceINR || course.priceINR <= 0;
    const paidEntry = (user.paidCourses || []).find(
      (pc) => pc.courseId?.toString() === courseId && pc.isPaid === true
    );

    // Check if paid access has expired (validityDays from paidAt)
    let paidValid = !!paidEntry;
    if (paidEntry && course.validityDays && paidEntry.paidAt) {
      const expiry = new Date(paidEntry.paidAt);
      expiry.setDate(expiry.getDate() + course.validityDays);
      if (new Date() > expiry) paidValid = false;
    }

    const isPaid = isFree || paidValid;

    return res.status(200).json({
      course,
      isPaid,
      isFree,
      paidAt:    paidEntry?.paidAt    || null,
      expiresAt: paidEntry?.paidAt && course.validityDays
        ? new Date(new Date(paidEntry.paidAt).setDate(new Date(paidEntry.paidAt).getDate() + course.validityDays))
        : null,
    });
  } catch (err) {
    console.error("getCourseAccess error:", err);
    return res.status(500).json({ message: "Failed to check course access" });
  }
};

export const updateUserInCourse = async (req, res) => {
  try {
    const { courseId, userId } = req.params;
    const { isPaid, progress, testResults } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const enrollment = user.paidCourses.find(pc => pc.courseId.toString() === courseId);
    if (!enrollment) return res.status(400).json({ message: "User not enrolled in this course" });
    if (typeof isPaid !== "undefined") enrollment.isPaid = isPaid;
    if (progress) enrollment.progress = progress;
    if (testResults) enrollment.testResults = testResults;
    await user.save();
    return res.json({ message: "User updated for this course", enrollment });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const removeUserFromCourse = async (req, res) => {
  try {
    const { courseId, userId } = req.params;
    const [course, user] = await Promise.all([Course.findById(courseId), User.findById(userId)]);
    if (!course || !user) return res.status(404).json({ message: "Course or user not found" });
    course.enrolledUsers = course.enrolledUsers.filter(id => id.toString() !== userId);
    await course.save();
    user.paidCourses = user.paidCourses.filter(pc => pc.courseId.toString() !== courseId);
    await user.save();
    return res.status(200).json({ message: "User removed from course" });
  } catch (err) {
    console.error("Error removing user from course:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
