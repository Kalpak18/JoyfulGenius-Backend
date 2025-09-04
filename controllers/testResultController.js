// controllers/testResultController.js
import mongoose from "mongoose";
import TestResult from "../models/TestResult.js";
import TestAttempt from "../models/testAttempts.js";
import Chapter from "../models/chapter.js"; // note lowercase
import Course from "../models/Course.js";
import Subject from "../models/subject.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/**
 * 1) Save a test result (client already scored)
 */
export const saveTheResult = async (req, res) => {
  const { courseId, chapterId, subjectId, score, total, detailedResults, type = "chapter" } = req.body;
  const userId = req.user.id;

  try {
    if (!courseId || !chapterId || typeof score !== "number" || typeof total !== "number") {
      return res.status(400).json({ message: "courseId, chapterId, score, total are required" });
    }
    if (type === "chapter" && !subjectId) {
      return res.status(400).json({ message: "subjectId is required for chapter tests" });
    }
    if (score > total) {
      return res.status(400).json({ message: "Score cannot exceed total" });
    }

    const chapter = await Chapter.findById(chapterId);
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });
    if (chapter.courseId.toString() !== courseId) {
      return res.status(400).json({ message: "Chapter does not belong to the given course" });
    }

    // Check attempt limit
    const limit = typeof chapter.attemptLimit === "number" ? chapter.attemptLimit : null;
    if (limit !== null) {
      const attempt = await TestAttempt.findOne({ user: userId, courseId, chapterId, testType: type });
      if (attempt && attempt.attemptCount >= limit) {
        return res.status(403).json({ message: "You have reached the attempt limit for this test" });
      }
    }

    const result = await TestResult.create({
      user: userId,
      courseId,
      chapterId,
      subjectId,
      score,
      total,
      testType: type,
      details: Array.isArray(detailedResults) ? detailedResults : [],
    });

    // Always increment attempt counter safely
    await TestAttempt.findOneAndUpdate(
      { user: userId, courseId, chapterId, testType: type },
      { $inc: { attemptCount: 1 } },
      { upsert: true, new: true }
    );

    res.status(201).json({
      message: "Result saved successfully",
      resultId: result._id,
    });
  } catch (err) {
    console.error("saveTheResult error:", err);
    res.status(500).json({ message: "Failed to save result" });
  }
};

/**
 * 2) Get my results (with optional filters)
 */
export const getUserResults = async (req, res) => {
  try {
    const { courseId, chapterId, testType, subjectId } = req.query;
    const q = { user: req.user.id };

    if (courseId) q.courseId = toObjectId(courseId);
    if (chapterId) q.chapterId = toObjectId(chapterId);
    if (subjectId) q.subjectId = toObjectId(subjectId);
    if (testType) q.testType = testType;

     const results = await TestResult.find(q)
      .populate("courseId", "name")
      .populate("subjectId", "name")
      .populate("chapterId", "name")
      .sort({ createdAt: -1 });

    // Map results so we return clean names instead of nested objects
    const formatted = results.map(r => ({
      ...r.toObject(),
      courseName: r.courseId?.name || null,
      subjectName: r.subjectId?.name || null,
      chapterName: r.chapterId?.name || null,
      testType: r.testType || r.type || "chapter", 
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("getUserResults error:", err);
    res.status(500).json({ message: "Error fetching test results" });
  }
};

export const getUserTestResults = getUserResults;

/**
 * 3) Add a manual test by USER (counts towards attempt limit)
 */
export const addManualTestByUser = async (req, res) => {
  const { courseId, chapterId, subjectId, score, total, testType } = req.body;
  const userId = req.user.id;

  try {
    if (!courseId || !chapterId || typeof score !== "number" || typeof total !== "number") {
      return res.status(400).json({ message: "courseId, chapterId, score, total are required" });
    }
    if (score > total) {
      return res.status(400).json({ message: "Score cannot exceed total" });
    }

    const chapter = await Chapter.findById(chapterId);
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });
    if (chapter.courseId.toString() !== courseId) {
      return res.status(400).json({ message: "Chapter does not belong to the given course" });
    }

    const type = "manual";
    const limit = typeof chapter.attemptLimit === "number" ? chapter.attemptLimit : null;
    if (limit !== null) {
      const attempt = await TestAttempt.findOne({ user: userId, courseId, chapterId, testType: type });
      if (attempt && attempt.attemptCount >= limit) {
        return res.status(403).json({ message: "You have reached the attempt limit for this test" });
      }
    }

    await TestResult.create({
      user: userId,
      courseId,
      chapterId,
      subjectId,
      score,
      total,
      testType: "manual",
      details: [],
    });

    await TestAttempt.findOneAndUpdate(
      { user: userId, courseId, chapterId, testType: type },
      { $inc: { attemptCount: 1 } },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Manual test result added" });
  } catch (err) {
    console.error("addManualTestByUser error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 4) Add a manual test by ADMIN (no attempt limit)
 */
export const addManualTestByAdmin = async (req, res) => {
  const { userId, courseId, chapterId, subjectId, score, total } = req.body;

  try {
    if (!userId || !courseId || !chapterId || typeof score !== "number" || typeof total !== "number") {
      return res.status(400).json({ message: "userId, courseId, chapterId, score, total are required" });
    }
    if (score > total) {
      return res.status(400).json({ message: "Score cannot exceed total" });
    }

    const chapter = await Chapter.findById(chapterId);
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });
    if (chapter.courseId.toString() !== courseId) {
      return res.status(400).json({ message: "Chapter does not belong to the given course" });
    }

    const type = "manual";

    await TestResult.create({
      user: userId,
      courseId,
      chapterId,
      subjectId,
      score,
      total,
      testType: type,
      details: [],
    });

    await TestAttempt.findOneAndUpdate(
      { user: userId, courseId, chapterId, testType: type },
      { $inc: { attemptCount: 1 } },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Manual test added by admin" });
  } catch (err) {
    console.error("addManualTestByAdmin error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 5) Update a test result (owner-only)
 */
export const updateTestResult = async (req, res) => {
  const { id } = req.params;
  const { subjectId, score, total, details } = req.body;

  try {
    const result = await TestResult.findById(id);
    if (!result) return res.status(404).json({ message: "Test result not found" });
    if (result.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to edit this test" });
    }
    if (result.testType !== "manual") {
  return res.status(403).json({ message: "Only manual test results can be updated" });
}

    if (subjectId) result.subjectId = subjectId;
    if (typeof score === "number") result.score = score;
    if (typeof total === "number") result.total = total;
    if (score > total) {
      return res.status(400).json({ message: "Score cannot exceed total" });
    }
    if (Array.isArray(details)) result.details = details;

    await result.save();
    res.status(200).json({ message: "Test updated successfully" });
  } catch (err) {
    console.error("updateTestResult error:", err);
    res.status(500).json({ message: "Failed to update test" });
  }
};

/**
 * 6) Delete a test result (owner-only, decrements attempt counter)
 */
export const deleteTestResult = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await TestResult.findById(id);
    if (!result) return res.status(404).json({ message: "Test result not found" });
    if (result.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this test" });
    }

    await result.deleteOne();

    // Decrement attempt counter
    await TestAttempt.findOneAndUpdate(
      { user: req.user.id, courseId: result.courseId, chapterId: result.chapterId, testType: result.testType },
      { $inc: { attemptCount: -1 } }
    );

    res.status(200).json({ message: "Test deleted successfully" });
  } catch (err) {
    console.error("deleteTestResult error:", err);
    res.status(500).json({ message: "Failed to delete test" });
  }
};
