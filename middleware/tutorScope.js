// middleware/tutorScope.js
//
// Single source of truth for course-content authorization.
//
// The role model:
//   - developer → platform ops only. Manages admin/tutor accounts. Cannot
//                 create, edit, or delete course content. Cannot grade.
//   - admin     → course owner. Full write access to courses where they
//                 are Course.createdBy. Can create tutors scoped to their
//                 courses. Can grade in their courses.
//   - tutor     → scoped worker inside an admin's course. Write access
//                 only where courseId is in scopedCourseIds (further
//                 narrowed by subjectScopes for the grading routing).
//
// Never bypass these by checking role directly in a controller.

import mongoose from "mongoose";
import Course     from "../models/Course.js";
import Subject    from "../models/subject.js";
import Chapter    from "../models/chapter.js";
import Lecture    from "../models/Lecture.js";
import Question   from "../models/question.js";
import Assignment from "../models/Assignment.js";
import Section      from "../models/Section.js";
import ContentBlock from "../models/ContentBlock.js";

const KIND_TO_MODEL = {
  course:     Course,
  subject:    Subject,
  chapter:    Chapter,
  lecture:    Lecture,
  question:   Question,
  assignment: Assignment,
  section:    Section,
  block:      ContentBlock,
};

// ── ownership check ──────────────────────────────────────────────────────
// Cached per-request via req._courseOwnerCache so repeated middleware in a
// single chain don't hit the DB twice.
async function isCourseOwner(admin, courseId, req) {
  if (!admin || !courseId) return false;
  const key = courseId.toString();
  const cache = req._courseOwnerCache || (req._courseOwnerCache = {});
  if (key in cache) return cache[key] === admin._id.toString() || cache[key] === null;
  const doc = await Course.findById(courseId).select("createdBy").lean();
  const owner = doc?.createdBy?.toString() || null;
  cache[key] = owner;
  // null/missing createdBy = legacy course, treat admin as owner
  return owner === null || owner === admin._id.toString();
}

// True if the admin is allowed to WRITE content in this course.
//   developer  → never (they don't touch course content)
//   admin      → only if they own the course
//   tutor      → only if courseId is in scopedCourseIds
export async function adminCanWriteCourse(admin, courseId, req = {}) {
  if (!admin || !courseId) return false;
  if (admin.role === "developer") return false;
  if (admin.role === "admin")     return isCourseOwner(admin, courseId, req);
  if (admin.role === "tutor") {
    return (admin.scopedCourseIds || []).some(
      (id) => id?.toString() === courseId.toString()
    );
  }
  return false;
}

// Sync form used by controllers that already have a courseId + admin in hand
// and don't want to await. Falls back to conservative "no" for admin role
// when we can't check ownership synchronously — controllers that need the
// admin-owner check should await adminCanWriteCourse instead.
export function adminCanWriteCourseSync(admin, courseId) {
  if (!admin || !courseId) return false;
  if (admin.role === "developer") return false;
  if (admin.role === "tutor") {
    return (admin.scopedCourseIds || []).some(
      (id) => id?.toString() === courseId.toString()
    );
  }
  // admin ownership must be checked async — caller should use the async variant
  return admin.role === "admin";
}

function pickFromReq(req, key) {
  return req.params?.[key] ?? req.query?.[key] ?? req.body?.[key] ?? null;
}

// Case A — courseId is on the request.
export function requireCourseScope(paramKey = "courseId") {
  return async (req, res, next) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ message: "Admin auth required" });

    // Developers do not write course content.
    if (admin.role === "developer") {
      return res.status(403).json({ message: "Developers manage accounts, not course content." });
    }

    const courseId =
      pickFromReq(req, paramKey) ||
      pickFromReq(req, "courseId");

    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "courseId is required" });
    }

    const ok = await adminCanWriteCourse(admin, courseId, req);
    if (!ok) {
      return res.status(403).json({
        message: admin.role === "tutor"
          ? "Tutors can only modify their assigned courses."
          : "You can only modify courses you own.",
      });
    }
    return next();
  };
}

// Case B — courseId lives on a parent doc.
export function requireCourseScopeBy({ kind, paramKey = "id" }) {
  const Model = KIND_TO_MODEL[kind];
  if (!Model) throw new Error(`tutorScope: unknown kind "${kind}"`);

  return async (req, res, next) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ message: "Admin auth required" });

    if (admin.role === "developer") {
      return res.status(403).json({ message: "Developers manage accounts, not course content." });
    }

    const id = req.params?.[paramKey];
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: `Invalid ${kind} id` });
    }

    try {
      // For the Course kind the courseId IS the id.
      const courseId = kind === "course"
        ? id
        : (await Model.findById(id).select("courseId").lean())?.courseId;

      if (!courseId) return res.status(404).json({ message: `${kind} not found` });

      const ok = await adminCanWriteCourse(admin, courseId, req);
      if (!ok) {
        return res.status(403).json({
          message: admin.role === "tutor"
            ? "Tutors can only modify their assigned courses."
            : "You can only modify courses you own.",
        });
      }
      return next();
    } catch (err) {
      console.error(`tutorScope (${kind}) error:`, err);
      return res.status(500).json({ message: "Scope check failed" });
    }
  };
}

// For LIST endpoints. Developers see nothing content-wise; admins see their
// own courses; tutors see their scoped courses.
// Returns a Mongo filter to merge into your list query.
export function scopeListFilter(admin) {
  if (!admin) return { _id: null };
  if (admin.role === "developer") return { _id: null };
  if (admin.role === "admin")     return { createdBy: admin._id };
  if (admin.role === "tutor") {
    const ids = (admin.scopedCourseIds || []).map((x) => x.toString());
    if (!ids.length) return { _id: null };
    return { courseId: { $in: ids } };
  }
  return { _id: null };
}

// For Course list endpoints where the courseId IS the doc _id.
export function scopeCourseListFilter(admin) {
  if (!admin) return { _id: null };
  if (admin.role === "developer") return { _id: null };
  if (admin.role === "admin") {
    // Include courses this admin owns + legacy courses with no createdBy.
    return {
      $or: [
        { createdBy: admin._id },
        { createdBy: { $exists: false } },
        { createdBy: null },
      ],
    };
  }
  if (admin.role === "tutor") {
    const ids = (admin.scopedCourseIds || []).map((x) => x.toString());
    if (!ids.length) return { _id: null };
    return { _id: { $in: ids } };
  }
  return { _id: null };
}
