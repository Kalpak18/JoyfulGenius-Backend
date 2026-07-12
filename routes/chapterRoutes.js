import express from "express";
import { createOrUpdateChapter, updateChapter, getAllChapters, deleteChapter, getChaptersByCourseAndSubject } from "../controllers/chapterController.js";
import {validateRequest as validate} from "../middleware/validateRequest.js";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import { requirePaidCourse } from "../middleware/requirePaidCourse.js";
import { createOrUpdateChapterSchema, getAllChaptersSchema, deleteChapterSchema } from "../validation/chapterSchemas.js";

const router = express.Router();

// Admin-only create/update — courseId comes from the body for create-or-update.
router.post("/", verifyAdmin, requireCourseScope("courseId"), validate(createOrUpdateChapterSchema), createOrUpdateChapter);

// Get chapters — courseId in query gates on payment
router.get("/", protect, requirePaidCourse, validate(getAllChaptersSchema), getAllChapters);

// Update chapter by ID (admin only)
router.put("/:id", verifyAdmin, requireCourseScopeBy({ kind: "chapter", paramKey: "id" }), updateChapter);

// Delete chapter (admin only)
router.delete("/:id", verifyAdmin, requireCourseScopeBy({ kind: "chapter", paramKey: "id" }), validate(deleteChapterSchema), deleteChapter);

router.get("/:courseId/:subjectId", protect, requirePaidCourse, getChaptersByCourseAndSubject);

export default router;
