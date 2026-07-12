// routes/testBundleRoutes.js
import express from "express";
import { protect, verifyAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";
import {
  listBundles,
  getBundle,
  createBundle,
  updateBundle,
  deleteBundle,
  addQuestionsToBundle,
  removeQuestionsFromBundle,
  listBundlesForStudent,
} from "../controllers/testBundleController.js";

const router = express.Router();

// ── Student routes ────────────────────────────────────────────────────────
// GET /api/bundles?courseId=...  — published bundles only
router.get("/", protect, listBundlesForStudent);

// ── Admin routes ──────────────────────────────────────────────────────────
router.get   ("/admin",     verifyAdmin, listBundles);
router.get   ("/admin/:id", verifyAdmin, getBundle);
router.post  ("/admin",     verifyAdmin, auditLog("CREATE_BUNDLE"), createBundle);
router.put   ("/admin/:id", verifyAdmin, auditLog("UPDATE_BUNDLE"), updateBundle);
router.delete("/admin/:id", verifyAdmin, auditLog("DELETE_BUNDLE"), deleteBundle);

// Add / remove questions from a bundle
router.post("/admin/:id/questions",        verifyAdmin, auditLog("ADD_QUESTIONS_TO_BUNDLE"),    addQuestionsToBundle);
router.delete("/admin/:id/questions",      verifyAdmin, auditLog("REMOVE_QUESTIONS_FROM_BUNDLE"), removeQuestionsFromBundle);

export default router;
