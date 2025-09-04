import express from "express";
import {
  addQuestion,
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

const router = express.Router();

// Add a question (Admin only)
router.post(
  "/",
  verifyAdmin,
  validate(addQuestionSchema),
  addQuestion
);

// Get questions (any logged in user)
router.get(
  "/",
  protect,
  validate(getQuestionsSchema),
  getQuestions
);

// Update a question (Admin only)
router.patch(
  "/:id",
  verifyAdmin,
  validate(updateQuestionSchema),
  updateQuestion
);

// Delete a question (Admin only)
router.delete(
  "/:id",
  verifyAdmin,
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
