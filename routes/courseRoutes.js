import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import {
  createCourse,
  getCourses,
  updateCourse,
  deleteCourse,
  enrollUser,
 getCoursesForUser,
  getCourseByNameForUser,
  // getUsersByCourse,
  updateUserInCourse,
  removeUserFromCourse
} from "../controllers/courseController.js";

import {
  createCourseSchema,
  updateCourseSchema,
  deleteCourseSchema,
  enrollUserSchema
} from "../validation/courseSchemas.js";

const router = express.Router();

router.post("/", verifyAdmin, validate(createCourseSchema), createCourse);
router.get("/", protect, getCourses);
router.put("/:courseId", verifyAdmin, validate(updateCourseSchema), updateCourse);
router.delete("/:courseId", verifyAdmin, validate(deleteCourseSchema), deleteCourse);
router.post("/visit-course", protect, validate(enrollUserSchema), enrollUser);


router.get("/user/courses", protect, getCoursesForUser);               // fetch all courses for user with paid status
router.get("/user/course/:coursename", protect, getCourseByNameForUser);

// Admin views all users in a course
// router.get("/:courseId/users", getUsersByCourse);

// Admin updates user info for a course
router.patch("/:courseId/users/:userId", updateUserInCourse);

// DELETE user from a specific course
router.delete("/:courseId/users/:userId", verifyAdmin, removeUserFromCourse);



export default router;
