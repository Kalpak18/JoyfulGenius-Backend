import express from "express";
import {
  createOrUpdateChapter,
  getAllChapters,
  deleteChapter,
} from "../controllers/chapterController.js";

const router = express.Router();

// POST: Add or update
router.post("/", createOrUpdateChapter);

// GET: All chapters
router.get("/", getAllChapters);

// DELETE: Delete by ID
router.delete("/:id", deleteChapter);

export default router;
