// controllers/testBundleController.js
//
// Admin CRUD for TestBundle (question-paper bundles in test_series courses).

import mongoose from "mongoose";
import TestBundle from "../models/TestBundle.js";
import Question   from "../models/question.js";

// ─── List bundles for a course ────────────────────────────────────────────

export const listBundles = async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "courseId is required" });
    }
    const bundles = await TestBundle.find({ courseId })
      .select("-questionIds")   // don't send full question list on list view
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return res.json(bundles);
  } catch (err) {
    console.error("listBundles error:", err);
    return res.status(500).json({ message: "Failed to list bundles" });
  }
};

// ─── Get one bundle (with questions for admin preview) ────────────────────

export const getBundle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const bundle = await TestBundle.findById(id)
      .populate({ path: "questionIds", select: "question options correctAnswer subjectId chapterId" })
      .lean();
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });
    return res.json(bundle);
  } catch (err) {
    console.error("getBundle error:", err);
    return res.status(500).json({ message: "Failed to get bundle" });
  }
};

// ─── Create bundle ────────────────────────────────────────────────────────

export const createBundle = async (req, res) => {
  try {
    const {
      courseId, title, description, paperType, bundleType,
      subjectId, chapterId,
      questionIds, materialUrl,
      durationMinutes, marksPerCorrect, negativeMarks,
      access, attemptLimit,
      isPublished, availableFrom, availableUntil, sortOrder,
    } = req.body;

    if (!courseId || !title) {
      return res.status(400).json({ message: "courseId and title are required" });
    }

    const resolvedType = bundleType || "mcq";

    // validate questionIds (only relevant for mcq bundles)
    const validQIds = resolvedType === "mcq" && Array.isArray(questionIds)
      ? questionIds.filter(id => mongoose.isValidObjectId(id))
      : [];

    const bundle = await TestBundle.create({
      courseId, title, description, paperType,
      bundleType:  resolvedType,
      materialUrl: resolvedType !== "mcq" ? (materialUrl || "") : "",
      subjectId:  subjectId  || null,
      chapterId:  chapterId  || null,
      questionIds: validQIds,
      durationMinutes: durationMinutes || 90,
      marksPerCorrect: marksPerCorrect ?? 1,
      negativeMarks:   negativeMarks   ?? 0,
      access:       access      || "paid",
      attemptLimit: attemptLimit ?? null,
      isPublished:  isPublished  ?? false,
      availableFrom:  availableFrom  || null,
      availableUntil: availableUntil || null,
      sortOrder:    sortOrder || 0,
      createdBy: req.admin?._id,
      updatedBy: req.admin?._id,
    });

    return res.status(201).json(bundle);
  } catch (err) {
    console.error("createBundle error:", err);
    return res.status(500).json({ message: err.message || "Failed to create bundle" });
  }
};

// ─── Update bundle ────────────────────────────────────────────────────────

export const updateBundle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const bundle = await TestBundle.findById(id);
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    const allowed = [
      "title", "description", "paperType", "bundleType", "materialUrl",
      "subjectId", "chapterId", "questionIds",
      "durationMinutes", "marksPerCorrect", "negativeMarks",
      "access", "attemptLimit",
      "isPublished", "availableFrom", "availableUntil", "sortOrder",
    ];
    for (const k of allowed) {
      if (k in req.body) bundle[k] = req.body[k];
    }

    // filter invalid question ids
    if (req.body.questionIds) {
      bundle.questionIds = req.body.questionIds.filter(id => mongoose.isValidObjectId(id));
    }
    // clear questions if switching away from mcq type
    if (req.body.bundleType && req.body.bundleType !== "mcq") {
      bundle.questionIds = [];
    }

    bundle.updatedBy = req.admin?._id;
    await bundle.save();
    return res.json(bundle);
  } catch (err) {
    console.error("updateBundle error:", err);
    return res.status(500).json({ message: "Failed to update bundle" });
  }
};

// ─── Delete bundle ────────────────────────────────────────────────────────

export const deleteBundle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const bundle = await TestBundle.findByIdAndDelete(id);
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteBundle error:", err);
    return res.status(500).json({ message: "Failed to delete bundle" });
  }
};

// ─── Add / remove questions from a bundle ────────────────────────────────

export const addQuestionsToBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ message: "questionIds[] is required" });
    }

    const validIds = questionIds.filter(qid => mongoose.isValidObjectId(qid));
    const bundle = await TestBundle.findByIdAndUpdate(
      id,
      { $addToSet: { questionIds: { $each: validIds } } },
      { new: true }
    );
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });
    return res.json({ ok: true, total: bundle.questionIds.length });
  } catch (err) {
    console.error("addQuestionsToBundle error:", err);
    return res.status(500).json({ message: "Failed to add questions" });
  }
};

export const removeQuestionsFromBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ message: "questionIds[] is required" });
    }

    const bundle = await TestBundle.findByIdAndUpdate(
      id,
      { $pull: { questionIds: { $in: questionIds } } },
      { new: true }
    );
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });
    return res.json({ ok: true, total: bundle.questionIds.length });
  } catch (err) {
    console.error("removeQuestionsFromBundle error:", err);
    return res.status(500).json({ message: "Failed to remove questions" });
  }
};

// ─── Student: list published bundles for a course ─────────────────────────

export const listBundlesForStudent = async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "courseId is required" });
    }

    // Check if student has paid access to this course
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(req.user?.id).select("paidCourses").lean();
    const hasPaid = user?.paidCourses?.some(
      pc => pc.courseId?.toString() === courseId && pc.isPaid
    ) ?? false;

    // Filter: if not paid, only return access:"all" bundles
    const filter = { courseId, isPublished: true };
    if (!hasPaid) filter.access = "all";

    const bundles = await TestBundle.find(filter)
      .select("title description paperType bundleType materialUrl durationMinutes marksPerCorrect negativeMarks access attemptLimit availableFrom availableUntil sortOrder")
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return res.json(bundles);
  } catch (err) {
    console.error("listBundlesForStudent error:", err);
    return res.status(500).json({ message: "Failed to list bundles" });
  }
};
