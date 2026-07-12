// controllers/testController.js
//
// Two-phase in-app test flow:
//
//   1. GET  /api/tests/start?chapterId=...&testType=chapter
//      → Returns questions WITHOUT correctAnswer (secure)
//      → Checks access (paid/free), attempt limits, availability windows
//
//   2. POST /api/tests/submit
//      → Accepts questionIds + user answers, grades server-side, saves TestResult
//
//   3. GET  /api/tests/bundle/:bundleId/start
//      → Same as #1 but for TestBundle (test_series courses)
//
//   4. POST /api/tests/bundle/submit
//      → Grade and save a bundle test result
//

import mongoose from "mongoose";
import Question    from "../models/question.js";
import Chapter     from "../models/chapter.js";
import TestResult  from "../models/TestResult.js";
import TestAttempt from "../models/testAttempts.js";
import TestBundle  from "../models/TestBundle.js";
import User        from "../models/User.js";

const FREE_LIMIT   = 10;
const MASTER_LIMIT = 50;

// ─── helpers ──────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Strip correctAnswer before sending to client (never expose answers)
function sanitiseQuestions(questions) {
  return questions.map((q, idx) => ({
    _id:           q._id,
    index:         idx,
    question:      q.question,
    questionImage: q.questionImage || "",
    options:       q.options,
    optionImages:  q.optionImages  || ["", "", "", ""],
  }));
}

async function userHasPaidCourse(userId, courseId) {
  const user = await User.findById(userId).select("paidCourses").lean();
  if (!user) return false;
  return user.paidCourses.some(
    pc => pc.courseId?.toString() === courseId?.toString() && pc.isPaid
  );
}

async function getAttemptCount(userId, courseId, chapterId, testType) {
  const filter = { user: userId, courseId, testType };
  if (chapterId) filter.chapterId = chapterId;
  const doc = await TestAttempt.findOne(filter).lean();
  return doc ? doc.attemptCount : 0;
}

// ─── 1. Start a chapter / free / master test ──────────────────────────────

export const startTest = async (req, res) => {
  const userId = req.user?.id;
  const { chapterId, subjectId, courseId, testType = "chapter" } = req.query;

  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    let questions = [];
    let meta = { testType, durationMinutes: 30, marksPerCorrect: 1, negativeMarks: 0 };

    // ── chapter test ──────────────────────────────────────────────────────
    if (testType === "chapter") {
      if (!chapterId || !mongoose.isValidObjectId(chapterId)) {
        return res.status(400).json({ message: "chapterId is required" });
      }
      const chapter = await Chapter.findById(chapterId).lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      // Access check
      if (chapter.testAccess === "paid") {
        const paid = await userHasPaidCourse(userId, chapter.courseId);
        if (!paid) return res.status(403).json({ message: "This test is for paid students only" });
      }

      // Availability window
      const now = new Date();
      if (chapter.availableFrom && now < new Date(chapter.availableFrom)) {
        return res.status(403).json({ message: "This test is not available yet", availableFrom: chapter.availableFrom });
      }
      if (chapter.availableUntil && now > new Date(chapter.availableUntil)) {
        return res.status(403).json({ message: "This test has expired" });
      }

      // Attempt limit
      if (chapter.attemptLimit !== null && chapter.attemptLimit !== undefined) {
        const used = await getAttemptCount(userId, chapter.courseId, chapterId, "chapter");
        if (used >= chapter.attemptLimit) {
          return res.status(403).json({
            message: `Attempt limit reached (${chapter.attemptLimit} allowed, ${used} used)`,
            attemptsUsed: used,
            attemptLimit: chapter.attemptLimit,
          });
        }
      }

      questions = await Question.find({ chapterId, courseId: chapter.courseId }).lean();
      if (!questions.length) return res.status(404).json({ message: "No questions found for this chapter" });

      meta = {
        ...meta,
        chapterId:        chapter._id,
        subjectId:        chapter.subjectId,
        courseId:         chapter.courseId,
        chapterTitle:     chapter.title,
        testScheduleType: chapter.testScheduleType || "chapter",
        attemptLimit:     chapter.attemptLimit,
      };

    // ── free test (external-style, subject-wide) ──────────────────────────
    } else if (testType === "free") {
      if (!subjectId || !mongoose.isValidObjectId(subjectId)) {
        return res.status(400).json({ message: "subjectId is required for free tests" });
      }
      questions = shuffle(await Question.find({ subjectId }).lean()).slice(0, FREE_LIMIT);
      if (!questions.length) return res.status(404).json({ message: "No questions found" });
      meta.subjectId = subjectId;

    // ── in-app free test (chapter-based, no paid check) ───────────────────
    } else if (testType === "free_inapp") {
      if (!chapterId || !mongoose.isValidObjectId(chapterId)) {
        return res.status(400).json({ message: "chapterId is required" });
      }
      const chapter = await Chapter.findById(chapterId).lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      questions = await Question.find({ chapterId, courseId: chapter.courseId }).lean();
      if (!questions.length) return res.status(404).json({ message: "No questions found for this chapter" });

      meta = {
        ...meta,
        chapterId:    chapter._id,
        subjectId:    chapter.subjectId,
        courseId:     chapter.courseId,
        chapterTitle: chapter.title,
        attemptLimit: chapter.attemptLimit,
      };

    // ── in-app master test (chapter-based, paid check) ────────────────────
    } else if (testType === "master_inapp") {
      if (!chapterId || !mongoose.isValidObjectId(chapterId)) {
        return res.status(400).json({ message: "chapterId is required" });
      }
      const chapter = await Chapter.findById(chapterId).lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      const paid = await userHasPaidCourse(userId, chapter.courseId);
      if (!paid) return res.status(403).json({ message: "This test is for paid students only" });

      // Attempt limit
      if (chapter.attemptLimit !== null && chapter.attemptLimit !== undefined) {
        const used = await getAttemptCount(userId, chapter.courseId, chapterId, "master_inapp");
        if (used >= chapter.attemptLimit) {
          return res.status(403).json({
            message: `Attempt limit reached (${chapter.attemptLimit} allowed, ${used} used)`,
            attemptsUsed: used,
            attemptLimit: chapter.attemptLimit,
          });
        }
      }

      questions = await Question.find({ chapterId, courseId: chapter.courseId }).lean();
      if (!questions.length) return res.status(404).json({ message: "No questions found for this chapter" });

      meta = {
        ...meta,
        chapterId:    chapter._id,
        subjectId:    chapter.subjectId,
        courseId:     chapter.courseId,
        chapterTitle: chapter.title,
        attemptLimit: chapter.attemptLimit,
        durationMinutes: 45,
      };

    // ── master test ───────────────────────────────────────────────────────
    } else if (testType === "master") {
      if (!courseId || !mongoose.isValidObjectId(courseId)) {
        return res.status(400).json({ message: "courseId is required for master tests" });
      }
      const paid = await userHasPaidCourse(userId, courseId);
      if (!paid) return res.status(403).json({ message: "Master tests are for paid students only" });

      questions = shuffle(await Question.find({ courseId }).lean()).slice(0, MASTER_LIMIT);
      if (!questions.length) return res.status(404).json({ message: "No questions found" });
      meta.courseId = courseId;
      meta.durationMinutes = 90;

    } else {
      return res.status(400).json({ message: `Unknown testType: ${testType}` });
    }

    return res.json({
      ...meta,
      total:       questions.length,
      questions:   sanitiseQuestions(questions),
      questionIds: questions.map(q => q._id),
    });

  } catch (err) {
    console.error("startTest error:", err);
    return res.status(500).json({ message: "Failed to start test" });
  }
};

// ─── 2. Submit a chapter / free / master test ─────────────────────────────

export const submitTest = async (req, res) => {
  const userId = req.user?.id;
  const {
    chapterId, subjectId, courseId,
    testType = "chapter",
    answers,
    questionIds,
    timeTakenSec,
    // manual test fields
    score, total, details,
  } = req.body;

  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // ── manual test (offline score entry) ────────────────────────────────
    if (testType === "manual") {
      if (!courseId || !subjectId || typeof score !== "number" || typeof total !== "number") {
        return res.status(400).json({ message: "manual tests require courseId, subjectId, score, total" });
      }
      await TestResult.create({
        user: userId, courseId, chapterId: chapterId || null, subjectId,
        score, total, testType: "manual",
        details: Array.isArray(details) ? details : [],
      });
      return res.status(201).json({ message: "Manual test saved", score, total });
    }

    // ── validate questionIds + fetch correct answers ──────────────────────
    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ message: "questionIds[] is required" });
    }
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "answers[] is required" });
    }

    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    if (!questions.length) return res.status(400).json({ message: "Questions not found" });

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

    const finalScore = correct;
    const finalTotal = questions.length;

    // ── in-app free/master chapter test: re-check limit before saving ────
    if (testType === "free_inapp" || testType === "master_inapp") {
      if (!chapterId) return res.status(400).json({ message: "chapterId required" });
      const chapter = await Chapter.findById(chapterId).lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      if (testType === "master_inapp" && chapter.attemptLimit !== null && chapter.attemptLimit !== undefined) {
        const used = await getAttemptCount(userId, chapter.courseId, chapterId, "master_inapp");
        if (used >= chapter.attemptLimit) {
          return res.status(403).json({ message: `Attempt limit reached (${chapter.attemptLimit} allowed)` });
        }
      }

      await TestResult.create({
        user: userId,
        courseId:  chapter.courseId,
        chapterId,
        subjectId: chapter.subjectId,
        score:  finalScore,
        total:  finalTotal,
        testType,
        timeTakenSec: timeTakenSec || null,
        details: detailedResults,
      });

      if (testType === "master_inapp") {
        await TestAttempt.findOneAndUpdate(
          { user: userId, courseId: chapter.courseId, chapterId, testType: "master_inapp" },
          { $inc: { attemptCount: 1 } },
          { upsert: true, new: true }
        );
      }

    // ── chapter test: re-check attempt limit before saving ────────────────
    } else if (testType === "chapter") {
      if (!chapterId) return res.status(400).json({ message: "chapterId required for chapter tests" });
      const chapter = await Chapter.findById(chapterId).lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      if (chapter.attemptLimit !== null && chapter.attemptLimit !== undefined) {
        const used = await getAttemptCount(userId, chapter.courseId, chapterId, "chapter");
        if (used >= chapter.attemptLimit) {
          return res.status(403).json({ message: `Attempt limit reached (${chapter.attemptLimit} allowed)` });
        }
      }

      await TestResult.create({
        user: userId,
        courseId:  chapter.courseId,
        chapterId,
        subjectId: chapter.subjectId,
        score:  finalScore,
        total:  finalTotal,
        testType: "chapter",
        timeTakenSec: timeTakenSec || null,
        details: detailedResults,
      });

      await TestAttempt.findOneAndUpdate(
        { user: userId, courseId: chapter.courseId, chapterId, testType: "chapter" },
        { $inc: { attemptCount: 1 } },
        { upsert: true, new: true }
      );

    } else {
      const resolvedSubjectId = subjectId || questions[0]?.subjectId;
      await TestResult.create({
        user:     userId,
        courseId: courseId || null,
        chapterId: null,
        subjectId: resolvedSubjectId,
        score:  finalScore,
        total:  finalTotal,
        testType,
        timeTakenSec: timeTakenSec || null,
        details: detailedResults,
      });
    }

    return res.status(201).json({
      message:    "Test submitted",
      score:      finalScore,
      total:      finalTotal,
      correct,
      wrong,
      skipped:    finalTotal - correct - wrong,
      percentage: Math.round((finalScore / finalTotal) * 100),
      detailedResults,
    });

  } catch (err) {
    console.error("submitTest error:", err);
    return res.status(500).json({ message: "Failed to submit test" });
  }
};

// ─── 3. Start a TestBundle (test_series course) ───────────────────────────

export const startBundleTest = async (req, res) => {
  const userId = req.user?.id;
  const { bundleId } = req.params;

  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(bundleId)) return res.status(400).json({ message: "Invalid bundleId" });

    const bundle = await TestBundle.findById(bundleId)
      .populate({ path: "questionIds", model: "Question" })
      .lean();
    if (!bundle || !bundle.isPublished) {
      return res.status(404).json({ message: "Test paper not found" });
    }

    // Access check
    if (bundle.access === "paid") {
      const paid = await userHasPaidCourse(userId, bundle.courseId);
      if (!paid) return res.status(403).json({ message: "This test is for paid students only" });
    }

    // Availability window
    const now = new Date();
    if (bundle.availableFrom && now < new Date(bundle.availableFrom)) {
      return res.status(403).json({ message: "This test is not available yet", availableFrom: bundle.availableFrom });
    }
    if (bundle.availableUntil && now > new Date(bundle.availableUntil)) {
      return res.status(403).json({ message: "This test has expired" });
    }

    // Attempt limit
    if (bundle.attemptLimit !== null && bundle.attemptLimit !== undefined) {
      const used = await getAttemptCount(userId, bundle.courseId, null, "bundle");
      if (used >= bundle.attemptLimit) {
        return res.status(403).json({ message: `Attempt limit reached (${bundle.attemptLimit} allowed)` });
      }
    }

    if (!bundle.questionIds?.length) {
      return res.status(404).json({ message: "This test paper has no questions yet" });
    }

    return res.json({
      bundleId:        bundle._id,
      title:           bundle.title,
      description:     bundle.description,
      paperType:       bundle.paperType,
      courseId:        bundle.courseId,
      total:           bundle.questionIds.length,
      durationMinutes: bundle.durationMinutes,
      marksPerCorrect: bundle.marksPerCorrect,
      negativeMarks:   bundle.negativeMarks,
      questions:       sanitiseQuestions(bundle.questionIds),
      questionIds:     bundle.questionIds.map(q => q._id),
    });

  } catch (err) {
    console.error("startBundleTest error:", err);
    return res.status(500).json({ message: "Failed to start test" });
  }
};

// ─── 4. Submit a TestBundle ────────────────────────────────────────────────

export const submitBundleTest = async (req, res) => {
  const userId = req.user?.id;
  const { bundleId, answers, questionIds, timeTakenSec } = req.body;

  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose.isValidObjectId(bundleId)) return res.status(400).json({ message: "Invalid bundleId" });

    const bundle = await TestBundle.findById(bundleId).lean();
    if (!bundle) return res.status(404).json({ message: "Bundle not found" });

    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ message: "questionIds[] is required" });
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

    const rawScore   = correct * bundle.marksPerCorrect - wrong * bundle.negativeMarks;
    const finalScore = Math.max(0, Math.round(rawScore * 10) / 10);
    const finalTotal = questions.length * bundle.marksPerCorrect;

    await TestResult.create({
      user: userId,
      courseId:  bundle.courseId,
      subjectId: bundle.subjectId || questions[0]?.subjectId,
      bundleId,
      score:  finalScore,
      total:  finalTotal,
      testType: "bundle",
      timeTakenSec: timeTakenSec || null,
      details: detailedResults,
    });

    await TestAttempt.findOneAndUpdate(
      { user: userId, courseId: bundle.courseId, testType: "bundle" },
      { $inc: { attemptCount: 1 } },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      message:    "Test submitted",
      score:      finalScore,
      total:      finalTotal,
      percentage: finalTotal > 0 ? Math.round((finalScore / finalTotal) * 100) : 0,
      correct,
      wrong,
      skipped:    finalTotal - correct - wrong,
      detailedResults,
    });

  } catch (err) {
    console.error("submitBundleTest error:", err);
    return res.status(500).json({ message: "Failed to submit test" });
  }
};
