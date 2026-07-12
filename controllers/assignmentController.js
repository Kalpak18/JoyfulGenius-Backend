// controllers/assignmentController.js
//
// Admin and student endpoints for subjective assignments.
//
//   ── Admin ─────────────────────────────────────────────────────────────
//   POST   /api/admin/assignments                       create
//   GET    /api/admin/assignments                       list (filter by courseId)
//   GET    /api/admin/assignments/:id                   get one
//   PATCH  /api/admin/assignments/:id                   update
//   DELETE /api/admin/assignments/:id                   delete (also drops submissions)
//   GET    /api/admin/assignments/:id/submissions       list all student submissions
//   GET    /api/admin/submissions/pending               tutor/admin inbox
//   PATCH  /api/admin/submissions/:subId/override       manual grade
//
//   ── Student ───────────────────────────────────────────────────────────
//   GET    /api/assignments?courseId=...                list open assignments user has paid access to
//   GET    /api/assignments/:id                         fetch one (no modelAnswer)
//   POST   /api/assignments/:id/submit                  submit answer
//   GET    /api/assignments/:id/mine                    get my submission for this assignment
//

import mongoose from "mongoose";
import Assignment from "../models/Assignment.js";
import Submission from "../models/Submission.js";
import Course     from "../models/Course.js";
import User       from "../models/User.js";
import Admin      from "../models/Admin.js";
import Question   from "../models/question.js";
import { adminCanWriteCourse } from "../middleware/tutorScope.js";

// ── helpers ──────────────────────────────────────────────────────────────

async function userHasPaidCourse(userId, courseId) {
  const user = await User.findById(userId).select("paidCourses").lean();
  if (!user) return false;
  return user.paidCourses.some(
    pc => pc.courseId?.toString() === courseId?.toString() && pc.isPaid
  );
}

// Public (student-facing) shape — never leak modelAnswer or rubric
function publicAssignment(a) {
  return {
    _id:              a._id,
    courseId:         a.courseId,
    subjectId:        a.subjectId,
    chapterId:        a.chapterId,
    assignmentType:   a.assignmentType || "written",
    title:            a.title,
    prompt:           a.prompt,
    maxMarks:         a.maxMarks,
    answerLimitChars: a.answerLimitChars,
    dueAt:            a.dueAt,
    status:           a.status,
    access:           a.access || "paid",
    availableFrom:    a.availableFrom || null,
    durationMinutes:  a.durationMinutes,
    marksPerCorrect:  a.marksPerCorrect,
    negativeMarks:    a.negativeMarks,
    questionCount:    Array.isArray(a.questionIds) ? a.questionIds.length : 0,
  };
}

// Resolve who should grade a new submission.
// Priority:
//   1. A tutor with matching (courseId, subjectId) in subjectScopes
//   2. A tutor whose scopedCourseIds contains courseId (course-wide tutor)
//   3. null — falls through to any course admin/developer
async function resolveAssignedReviewer(courseId, subjectId) {
  if (!courseId) return null;

  // Prefer a tutor scoped to this exact subject
  if (subjectId) {
    const subjectTutor = await Admin.findOne({
      role: "tutor",
      subjectScopes: {
        $elemMatch: {
          courseId,
          subjectIds: subjectId,
        },
      },
    }).select("_id").lean();
    if (subjectTutor) return subjectTutor._id;
  }

  // Fall back to a course-wide tutor
  const courseTutor = await Admin.findOne({
    role: "tutor",
    scopedCourseIds: courseId,
  }).select("_id").lean();

  return courseTutor?._id || null;
}

// ── Admin: create ────────────────────────────────────────────────────────

export const createAssignment = async (req, res) => {
  try {
    const {
      courseId, subjectId = null, chapterId = null,
      title, prompt, modelAnswer = "", rubric = "",
      maxMarks = 10, answerLimitChars = 3000,
      status = "draft", dueAt = null,
      assignmentType = "written",
      questionIds = [],
      durationMinutes = 30,
      marksPerCorrect = 1,
      negativeMarks = 0,
      access = "paid",
      availableFrom = null,
    } = req.body || {};

    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Valid courseId is required" });
    }
    if (!title?.trim() || !prompt?.trim()) {
      return res.status(400).json({ message: "title and prompt are required" });
    }

    const course = await Course.findById(courseId).select("_id").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    const doc = await Assignment.create({
      courseId,
      subjectId: subjectId && mongoose.isValidObjectId(subjectId) ? subjectId : null,
      chapterId: chapterId && mongoose.isValidObjectId(chapterId) ? chapterId : null,
      title:       title.trim(),
      prompt:      prompt.trim(),
      modelAnswer: String(modelAnswer || "").trim(),
      rubric:      String(rubric || "").trim(),
      maxMarks:    Number(maxMarks) || 10,
      answerLimitChars: Number(answerLimitChars) || 3000,
      status,
      dueAt:       dueAt ? new Date(dueAt) : null,
      createdBy:   req.admin?._id || null,
      assignmentType,
      questionIds: assignmentType !== "written" ? questionIds.filter(id => mongoose.isValidObjectId(id)) : [],
      durationMinutes: Number(durationMinutes) || 30,
      marksPerCorrect: Number(marksPerCorrect) || 1,
      negativeMarks:   Number(negativeMarks)   || 0,
      access,
      availableFrom:   availableFrom ? new Date(availableFrom) : null,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("createAssignment error:", err);
    return res.status(500).json({ message: "Failed to create assignment" });
  }
};

// ── Admin: list ──────────────────────────────────────────────────────────

export const adminListAssignments = async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin || admin.role === "developer") return res.json([]);

    const { courseId, status } = req.query;
    const q = {};
    if (courseId && mongoose.isValidObjectId(courseId)) q.courseId = courseId;
    if (status) q.status = status;

    // Compute the set of course IDs this admin can see.
    let allowedCourseIds = null; // null = no restriction (should never happen now)
    if (admin.role === "admin") {
      const owned = await Course.find({ createdBy: admin._id }).select("_id").lean();
      allowedCourseIds = owned.map(c => c._id.toString());
    } else if (admin.role === "tutor") {
      allowedCourseIds = (admin.scopedCourseIds || []).map(String);
    }
    if (allowedCourseIds && allowedCourseIds.length === 0) return res.json([]);

    if (q.courseId) {
      if (allowedCourseIds && !allowedCourseIds.includes(q.courseId.toString())) {
        return res.status(403).json({ message: "You can only view your own courses." });
      }
    } else if (allowedCourseIds) {
      q.courseId = { $in: allowedCourseIds };
    }

    const items = await Assignment.find(q)
      .sort({ createdAt: -1 })
      .populate("courseId",  "name")
      .populate("subjectId", "name")
      .populate("chapterId", "title")
      .lean();
    return res.json(items);
  } catch (err) {
    console.error("adminListAssignments error:", err);
    return res.status(500).json({ message: "Failed to list assignments" });
  }
};

// ── Admin: get one ───────────────────────────────────────────────────────

export const adminGetAssignment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await Assignment.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(doc);
  } catch (err) {
    console.error("adminGetAssignment error:", err);
    return res.status(500).json({ message: "Failed to fetch assignment" });
  }
};

// ── Admin: update ────────────────────────────────────────────────────────

export const updateAssignment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const updatable = [
      "title", "prompt", "modelAnswer", "rubric",
      "maxMarks", "answerLimitChars", "status", "dueAt",
      "subjectId", "chapterId",
      "assignmentType", "questionIds", "durationMinutes", "marksPerCorrect",
      "negativeMarks", "access", "availableFrom",
    ];
    const patch = {};
    for (const k of updatable) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.dueAt) patch.dueAt = new Date(patch.dueAt);

    const doc = await Assignment.findByIdAndUpdate(req.params.id, patch, {
      new: true, runValidators: true,
    });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(doc);
  } catch (err) {
    console.error("updateAssignment error:", err);
    return res.status(500).json({ message: "Failed to update assignment" });
  }
};

// ── Admin: delete ────────────────────────────────────────────────────────

export const deleteAssignment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await Assignment.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    await Submission.deleteMany({ assignmentId: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteAssignment error:", err);
    return res.status(500).json({ message: "Failed to delete assignment" });
  }
};

// ── Admin: list submissions for an assignment ────────────────────────────

export const adminListSubmissions = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const items = await Submission.find({ assignmentId: req.params.id })
      .sort({ createdAt: -1 })
      .populate("user", "f_name last_name email whatsappNo")
      .lean();
    return res.json(items);
  } catch (err) {
    console.error("adminListSubmissions error:", err);
    return res.status(500).json({ message: "Failed to list submissions" });
  }
};

// ── Admin/Tutor: cross-assignment pending inbox ──────────────────────────
//
// Admins see pending submissions in courses they OWN (Course.createdBy).
// Tutors see submissions whose assignedReviewerId matches them, PLUS
// unassigned pending submissions in courses they're scoped to.
// Developers see nothing here — they don't grade.
export const listPendingSubmissions = async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ message: "Admin auth required" });

    if (admin.role === "developer") {
      return res.json([]);
    }

    const q = { status: "pending" };
    if (admin.role === "admin") {
      // Own courses only.
      const owned = await Course.find({ createdBy: admin._id }).select("_id").lean();
      const ownedIds = owned.map(c => c._id);
      if (ownedIds.length === 0) return res.json([]);
      q.courseId = { $in: ownedIds };
    } else if (admin.role === "tutor") {
      const courseIds = (admin.scopedCourseIds || []);
      q.$or = [
        { assignedReviewerId: admin._id },
        { assignedReviewerId: null, courseId: { $in: courseIds } },
      ];
    } else {
      return res.json([]);
    }

    const items = await Submission.find(q)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("assignmentId", "title maxMarks subjectId chapterId")
      .populate("courseId",  "name")
      .populate("subjectId", "name")
      .populate("user", "f_name last_name email whatsappNo")
      .lean();
    return res.json(items);
  } catch (err) {
    console.error("listPendingSubmissions error:", err);
    return res.status(500).json({ message: "Failed to list pending submissions" });
  }
};

// ── Admin/Tutor: manual grade ────────────────────────────────────────────

export const overrideSubmission = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.subId)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const { score, feedback, reason } = req.body || {};
    if (typeof score !== "number" || score < 0) {
      return res.status(400).json({ message: "score must be a non-negative number" });
    }

    const sub = await Submission.findById(req.params.subId);
    if (!sub) return res.status(404).json({ message: "Submission not found" });

    const a = await Assignment.findById(sub.assignmentId).select("maxMarks courseId").lean();
    if (a && !(await adminCanWriteCourse(req.admin, a.courseId, req))) {
      return res.status(403).json({ message: "You can only grade submissions in your own courses." });
    }
    if (a && score > a.maxMarks) {
      return res.status(400).json({ message: `score exceeds maxMarks (${a.maxMarks})` });
    }

    sub.score          = score;
    sub.feedback       = String(feedback || sub.feedback || "").slice(0, 5000);
    sub.status         = "overridden";
    sub.overriddenBy   = req.admin?._id || null;
    sub.overriddenAt   = new Date();
    sub.overrideReason = String(reason || "").slice(0, 500);
    sub.gradedAt       = sub.gradedAt || new Date();
    await sub.save();

    return res.json(sub);
  } catch (err) {
    console.error("overrideSubmission error:", err);
    return res.status(500).json({ message: "Failed to grade submission" });
  }
};

// ── Student: list assignments they have access to ────────────────────────

export const studentListAssignments = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { courseId } = req.query;
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Valid courseId is required" });
    }

    const course = await Course.findById(courseId).select("priceINR validityDays").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isPaidCourse = course.priceINR && course.priceINR > 0;
    let hasPaidAccess = false;
    if (isPaidCourse) {
      const user = await User.findById(userId).select("paidCourses").lean();
      const paidEntry = (user?.paidCourses || []).find(
        pc => pc.courseId?.toString() === courseId && pc.isPaid
      );
      if (paidEntry) {
        hasPaidAccess = true;
        if (course.validityDays && paidEntry.paidAt) {
          const expiry = new Date(paidEntry.paidAt);
          expiry.setDate(expiry.getDate() + course.validityDays);
          if (new Date() > expiry) hasPaidAccess = false;
        }
      }
    } else {
      hasPaidAccess = true;
    }

    const items = await Assignment.find({
      courseId,
      status: { $in: ["open", "closed"] },
    }).sort({ createdAt: -1 }).lean();

    const visible = items.filter(a => a.access === "all" || hasPaidAccess);

    const ids = visible.map(a => a._id);
    const mine = await Submission.find({ assignmentId: { $in: ids }, user: userId })
      .select("assignmentId status score gradedAt")
      .lean();
    const mineMap = new Map(mine.map(s => [s.assignmentId.toString(), s]));

    return res.json(visible.map(a => ({
      ...publicAssignment(a),
      mySubmission: mineMap.get(a._id.toString()) || null,
    })));
  } catch (err) {
    console.error("studentListAssignments error:", err);
    return res.status(500).json({ message: "Failed to list assignments" });
  }
};

// ── Student: get one assignment ──────────────────────────────────────────

export const studentGetAssignment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const a = await Assignment.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ message: "Not found" });
    if (a.status === "draft") return res.status(404).json({ message: "Not found" });

    const course = await Course.findById(a.courseId).select("priceINR validityDays").lean();
    const isPaidCourse = course?.priceINR > 0;
    if (isPaidCourse && a.access === "paid") {
      const user = await User.findById(userId).select("paidCourses").lean();
      const paidEntry = (user?.paidCourses || []).find(
        pc => pc.courseId?.toString() === a.courseId.toString() && pc.isPaid
      );
      let hasPaid = !!paidEntry;
      if (paidEntry && course.validityDays && paidEntry.paidAt) {
        const expiry = new Date(paidEntry.paidAt);
        expiry.setDate(expiry.getDate() + course.validityDays);
        if (new Date() > expiry) hasPaid = false;
      }
      if (!hasPaid) return res.status(403).json({ message: "Course access required" });
    }

    return res.json(publicAssignment(a));
  } catch (err) {
    console.error("studentGetAssignment error:", err);
    return res.status(500).json({ message: "Failed to fetch assignment" });
  }
};

// ── Student: submit ──────────────────────────────────────────────────────

export const studentSubmitAssignment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const a = await Assignment.findById(req.params.id);
    if (!a) return res.status(404).json({ message: "Not found" });
    if (a.status !== "open") return res.status(403).json({ message: "Assignment is not open for submissions" });
    if (a.dueAt && new Date() > a.dueAt) return res.status(403).json({ message: "Assignment deadline has passed" });

    const paid = await userHasPaidCourse(userId, a.courseId);
    if (!paid) return res.status(403).json({ message: "Course access required" });

    const raw = String(req.body?.answer || "").trim();
    if (!raw) return res.status(400).json({ message: "answer is required" });
    if (raw.length > a.answerLimitChars) {
      return res.status(400).json({ message: `answer exceeds limit of ${a.answerLimitChars} characters` });
    }

    // Route to the right grader. Recompute on every submission so re-submits
    // pick up staffing changes made since the last attempt.
    const assignedReviewerId = await resolveAssignedReviewer(a.courseId, a.subjectId);

    let sub = await Submission.findOne({ assignmentId: a._id, user: userId });
    if (!sub) {
      sub = new Submission({
        assignmentId: a._id,
        courseId:     a.courseId,
        subjectId:    a.subjectId || null,
        user:         userId,
        answer:       raw,
        status:       "pending",
        submittedAt:  new Date(),
        assignedReviewerId,
      });
    } else {
      // Don't let students re-submit after a manual grade lock.
      if (sub.status === "overridden") {
        return res.status(403).json({ message: "Your submission has been graded and is locked." });
      }
      sub.answer             = raw;
      sub.status             = "pending";
      sub.subjectId          = a.subjectId || null;
      sub.assignedReviewerId = assignedReviewerId;
      sub.submittedAt        = new Date();
      sub.score              = null;
      sub.feedback           = "";
      sub.gradedAt           = null;
    }
    await sub.save();

    return res.status(201).json(sub);
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await Submission.findOne({ assignmentId: req.params.id, user: req.user.id });
      return res.json(existing);
    }
    console.error("studentSubmitAssignment error:", err);
    return res.status(500).json({ message: "Failed to submit assignment" });
  }
};

// ── Student: my submission for this assignment ───────────────────────────

export const studentGetMySubmission = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const sub = await Submission.findOne({ assignmentId: req.params.id, user: userId }).lean();
    if (!sub) return res.status(404).json({ message: "No submission yet" });
    return res.json(sub);
  } catch (err) {
    console.error("studentGetMySubmission error:", err);
    return res.status(500).json({ message: "Failed to fetch submission" });
  }
};

// ── Student: start a quiz/surprise assignment ────────────────────────────
export const startQuizAssignment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const a = await Assignment.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ message: "Not found" });
    if (a.status !== "open") return res.status(403).json({ message: "Assignment is not open" });
    if (a.assignmentType !== "quiz" && a.assignmentType !== "surprise") {
      return res.status(400).json({ message: "Not a quiz assignment" });
    }

    if (a.assignmentType === "surprise" && a.availableFrom && new Date() < new Date(a.availableFrom)) {
      return res.status(403).json({ message: "This test is not available yet", availableFrom: a.availableFrom });
    }

    const course = await Course.findById(a.courseId).select("priceINR validityDays").lean();
    const isPaidCourse = course?.priceINR > 0;
    if (isPaidCourse && a.access === "paid") {
      const user = await User.findById(userId).select("paidCourses").lean();
      const paidEntry = (user?.paidCourses || []).find(
        pc => pc.courseId?.toString() === a.courseId.toString() && pc.isPaid
      );
      let hasPaid = !!paidEntry;
      if (paidEntry && course.validityDays && paidEntry.paidAt) {
        const expiry = new Date(paidEntry.paidAt);
        expiry.setDate(expiry.getDate() + course.validityDays);
        if (new Date() > expiry) hasPaid = false;
      }
      if (!hasPaid) return res.status(403).json({ message: "Course access required" });
    }

    const questions = await Question.find({ _id: { $in: a.questionIds } }).lean();
    const sanitised = questions.map((q, idx) => ({
      _id:           q._id,
      index:         idx,
      question:      q.question,
      questionImage: q.questionImage || "",
      options:       q.options,
      optionImages:  q.optionImages  || ["", "", "", ""],
    }));

    return res.json({
      assignmentId:    a._id,
      title:           a.title,
      prompt:          a.prompt,
      durationMinutes: a.durationMinutes,
      marksPerCorrect: a.marksPerCorrect,
      negativeMarks:   a.negativeMarks,
      questionIds:     a.questionIds,
      questions:       sanitised,
    });
  } catch (err) {
    console.error("startQuizAssignment error:", err);
    return res.status(500).json({ message: "Failed to start quiz" });
  }
};

// ── Student: submit a quiz/surprise assignment (auto-graded) ─────────────
export const submitQuizAssignment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const { answers, questionIds, timeTakenSec } = req.body || {};
    if (!Array.isArray(answers) || !Array.isArray(questionIds)) {
      return res.status(400).json({ message: "answers[] and questionIds[] are required" });
    }

    const a = await Assignment.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ message: "Not found" });
    if (a.status !== "open") return res.status(403).json({ message: "Assignment is not open" });
    if (a.assignmentType !== "quiz" && a.assignmentType !== "surprise") {
      return res.status(400).json({ message: "Not a quiz assignment" });
    }

    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const qMap = new Map(questions.map(q => [q._id.toString(), q]));

    let correct = 0, wrong = 0;
    const detailedResults = questionIds.map((qid, idx) => {
      const q = qMap.get(qid.toString());
      if (!q) return null;
      const userAnswer = (answers[idx] !== null && answers[idx] !== undefined) ? Number(answers[idx]) : null;
      const isCorrect  = userAnswer !== null && userAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      else if (userAnswer !== null) wrong++;
      return {
        question:      q.question,
        questionImage: q.questionImage  || "",
        options:       q.options,
        optionImages:  q.optionImages   || ["", "", "", ""],
        correctAnswer: q.correctAnswer,
        userAnswer,
        isCorrect,
        explanation:   q.explanation    || "",
      };
    }).filter(Boolean);

    const total = questions.length;
    const rawScore = correct * (a.marksPerCorrect || 1) - wrong * (a.negativeMarks || 0);
    const finalScore = Math.max(0, rawScore);
    const maxPossible = total * (a.marksPerCorrect || 1);
    const percentage = maxPossible > 0 ? Math.round((finalScore / maxPossible) * 100) : 0;

    let sub = await Submission.findOne({ assignmentId: a._id, user: userId });
    const answerSnapshot = JSON.stringify({ questionIds, answers, detailedResults });
    const autoFeedback = `Auto-graded: ${correct} correct, ${wrong} wrong, ${total - correct - wrong} skipped`;

    if (!sub) {
      sub = new Submission({
        assignmentId:       a._id,
        courseId:           a.courseId,
        subjectId:          a.subjectId || null,
        user:               userId,
        answer:             answerSnapshot,
        status:             "overridden",
        score:              finalScore,
        feedback:           autoFeedback,
        submittedAt:        new Date(),
        gradedAt:           new Date(),
        assignedReviewerId: null,
      });
    } else {
      if (sub.status === "overridden" && sub.overriddenBy) {
        return res.status(403).json({ message: "Your submission has been manually graded and is locked." });
      }
      sub.answer      = answerSnapshot;
      sub.status      = "overridden";
      sub.score       = finalScore;
      sub.feedback    = autoFeedback;
      sub.gradedAt    = new Date();
      sub.submittedAt = new Date();
    }
    await sub.save();

    return res.status(201).json({
      message:        "Quiz submitted",
      score:          finalScore,
      total:          maxPossible,
      correct,
      wrong,
      skipped:        total - correct - wrong,
      percentage,
      timeTakenSec:   timeTakenSec || null,
      detailedResults,
    });
  } catch (err) {
    console.error("submitQuizAssignment error:", err);
    return res.status(500).json({ message: "Failed to submit quiz" });
  }
};

// ── Admin: manage questions in a quiz assignment ─────────────────────────
export const addQuestionsToAssignment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const { questionIds = [] } = req.body;
    const valid = questionIds.filter(id => mongoose.isValidObjectId(id));
    const doc = await Assignment.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { questionIds: { $each: valid } } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ questionCount: doc.questionIds.length, questionIds: doc.questionIds });
  } catch (err) {
    console.error("addQuestionsToAssignment error:", err);
    return res.status(500).json({ message: "Failed to add questions" });
  }
};

export const removeQuestionsFromAssignment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const { questionIds = [] } = req.body;
    const doc = await Assignment.findByIdAndUpdate(
      req.params.id,
      { $pull: { questionIds: { $in: questionIds } } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ questionCount: doc.questionIds.length, questionIds: doc.questionIds });
  } catch (err) {
    console.error("removeQuestionsFromAssignment error:", err);
    return res.status(500).json({ message: "Failed to remove questions" });
  }
};
