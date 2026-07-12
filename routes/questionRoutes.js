import express from "express";
import {
  addQuestion,
  bulkImportQuestions,
  getQuestions,
  deleteQuestion,
  updateQuestion,
  getQuestionMetadata
} from "../controllers/questionController.js";

import { validateRequest as validate } from "../middleware/validateRequest.js";
import {
  addQuestionSchema,
  updateQuestionSchema,
  deleteQuestionSchema,
  getQuestionsSchema
} from "../validation/questionSchemas.js";

import { verifyAdmin, protect } from "../middleware/auth.js";
import { requireCourseScope, requireCourseScopeBy } from "../middleware/tutorScope.js";
import { requirePaidCourse } from "../middleware/requirePaidCourse.js";

const router = express.Router();

// Add a question (Admin only) — courseId in the body, scope-checked.
router.post("/", verifyAdmin, requireCourseScope("courseId"), validate(addQuestionSchema), addQuestion);

// Bulk import from CSV rows (Admin only) — courseId in the body.
router.post("/bulk-import", verifyAdmin, requireCourseScope("courseId"), bulkImportQuestions);

// Get questions — paid access required when courseId is present
router.get(
  "/",
  protect,
  requirePaidCourse,
  validate(getQuestionsSchema),
  getQuestions
);

// Update a question (Admin only)
router.patch(
  "/:id",
  verifyAdmin,
  requireCourseScopeBy({ kind: "question", paramKey: "id" }),
  validate(updateQuestionSchema),
  updateQuestion
);

// Delete a question (Admin only)
router.delete(
  "/:id",
  verifyAdmin,
  requireCourseScopeBy({ kind: "question", paramKey: "id" }),
  validate(deleteQuestionSchema),
  deleteQuestion
);

// Get metadata for filters (any logged in user)
router.get(
  "/metadata",
  protect,
  getQuestionMetadata
);

export default router;
