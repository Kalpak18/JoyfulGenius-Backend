import express from "express";
import { createOrUpdateChapter, getAllChapters, deleteChapter, getChaptersByCourseAndSubject } from "../controllers/chapterController.js";
import {validateRequest as validate} from "../middleware/validateRequest.js";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { createOrUpdateChapterSchema, getAllChaptersSchema, deleteChapterSchema } from "../validation/chapterSchemas.js";

const router = express.Router();

// Admin-only create/update
router.post("/", verifyAdmin, validate(createOrUpdateChapterSchema), createOrUpdateChapter);

// Get chapters (any authenticated user)
router.get("/", protect, validate(getAllChaptersSchema), getAllChapters);

// Delete chapter (admin only)
router.delete("/:id", verifyAdmin, validate(deleteChapterSchema), deleteChapter);

router.get("/:courseId/:subjectId", getChaptersByCourseAndSubject);

export default router;
