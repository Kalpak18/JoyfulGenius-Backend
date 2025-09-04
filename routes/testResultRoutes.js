// routes/testResultRoutes.js
import express from "express";
import {
  saveTheResult,
  getUserResults,
  getUserTestResults, // alias kept for compatibility
  addManualTestByUser,
  addManualTestByAdmin,
  updateTestResult,
  deleteTestResult,
} from "../controllers/testResultController.js";

import { protect, verifyAdmin, verifyUser } from "../middleware/auth.js";
import { validateRequest as validate } from "../middleware/validateRequest.js";
import {
  saveTheResultSchema,
  getUserResultsSchema,
  addManualTestByUserSchema,
  addManualTestByAdminSchema,
  updateTestResultSchema,
  deleteTestResultSchema,
} from "../validation/testResultSchemas.js";

const router = express.Router();

// Save a result (client-scored) — authenticated user
router.post("/save", protect, validate(saveTheResultSchema), saveTheResult);

// Get my results (optionally filtered)
router.get("/", protect, validate(getUserResultsSchema), getUserResults);

// Back-compat alias (same handler)
router.get("/mine", protect, validate(getUserResultsSchema), getUserTestResults);

// Add a manual test by the user (counts & enforces attempts)
router.post("/manual", verifyUser, validate(addManualTestByUserSchema), addManualTestByUser);

// Admin adds a manual test for a user (counts, no enforcement)
router.post("/manual-admin", verifyAdmin, validate(addManualTestByAdminSchema), addManualTestByAdmin);

// Update my result
router.put("/:id", protect, validate(updateTestResultSchema), updateTestResult);

// Delete my result
router.delete("/:id", protect, validate(deleteTestResultSchema), deleteTestResult);

export default router;
