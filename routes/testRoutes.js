// routes/testRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { startTest, submitTest, startBundleTest, submitBundleTest } from "../controllers/testController.js";

const router = express.Router();

// ── Chapter / free / master tests ─────────────────────────────────────────
// GET  /api/tests/start?chapterId=...&testType=chapter
//   → returns questions WITHOUT answers (access + attempt check inside)
router.get("/start", protect, startTest);

// POST /api/tests/submit
//   → receives questionIds + answers array, grades server-side, saves result
router.post("/submit", protect, submitTest);

// ── TestBundle (test_series courses) ──────────────────────────────────────
// GET  /api/tests/bundle/:bundleId/start
router.get("/bundle/:bundleId/start", protect, startBundleTest);

// POST /api/tests/bundle/submit
router.post("/bundle/submit", protect, submitBundleTest);

export default router;
