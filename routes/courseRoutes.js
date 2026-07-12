import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import {
  createCourse,
  getCourses,
  getPublicCourses,
  listCoursesForAdmin,
  updateCourse,
  deleteCourse,
  enrollUser,
  getCoursesForUser,
  getCourseByNameForUser,
  getCourseAccess,
  updateUserInCourse,
  removeUserFromCourse,
} from "../controllers/CourseController.js";

import {
  createCourseSchema,
  updateCourseSchema,
  deleteCourseSchema,
  enrollUserSchema,
} from "../validation/courseSchemas.js";

const router = express.Router();

// Public — no auth needed (slug, name, thumbnailUrl only)
router.get("/public", getPublicCourses);

// Admin list (drafts + archived included). Must come before any path that could match.
router.get("/admin/list", verifyAdmin, listCoursesForAdmin);

// Public student-facing routes
router.get   ("/",          protect,     getCourses);
// Course creation → only admin role (course owners). Developers manage accounts, not content.
// Tutors can't spawn courses either — controller enforces role check.
router.post  ("/",          verifyAdmin, validate(createCourseSchema),  createCourse);
router.put   ("/:courseId", verifyAdmin, requireCourseScopeBy({ kind: "course", paramKey: "courseId" }), validate(updateCourseSchema),  updateCourse);
router.delete("/:courseId", verifyAdmin, requireCourseScopeBy({ kind: "course", paramKey: "courseId" }), validate(deleteCourseSchema),  deleteCourse);
router.post  ("/visit-course", protect, validate(enrollUserSchema),     enrollUser);

router.get("/user/courses",            protect, getCoursesForUser);
router.get("/user/course/:coursename", protect, getCourseByNameForUser);

// Fresh server-side access check — used by frontend paywall (never trust localStorage alone)
router.get("/:courseId/access", protect, getCourseAccess);

router.patch ("/:courseId/users/:userId", verifyAdmin, requireCourseScopeBy({ kind: "course", paramKey: "courseId" }), updateUserInCourse);
router.delete("/:courseId/users/:userId", verifyAdmin, requireCourseScopeBy({ kind: "course", paramKey: "courseId" }), removeUserFromCourse);

export default router;
