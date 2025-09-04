// controllers/testController.js
import Question from "../models/question.js";
import Chapter from "../models/chapter.js";
import TestResult from "../models/TestResult.js";
import TestAttempt from "../models/testAttempts.js";

const FREE_MODE_LIMIT = 10;
const MASTER_MODE_LIMIT = 50;

export const submitTest = async (req, res) => {
  const { courseId, chapterId, subjectId, answers, testType = "chapter", score, total, details } = req.body;
  const userId = req.user?.id;

  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!subjectId) return res.status(400).json({ message: "subjectId is required" });

    let finalScore, finalTotal, detailedResults;

    // 🟢 MANUAL TEST
    if (testType === "manual") {
      if (!courseId || !subjectId ) {
       return res.status(400).json({ message: "Manual tests require courseId and subjectId" });
     }
     if (typeof score !== "number" || typeof total !== "number") {
       return res.status(400).json({ message: "Manual tests require score and total" });
     }
      finalScore = score;
      finalTotal = total;
      detailedResults = Array.isArray(details) ? details : [];

      await TestResult.create({
        user: userId,
        courseId: courseId || null,
        chapterId: chapterId || null,
        subjectId,
        score: finalScore,
        total: finalTotal,
        testType: "manual",
        details: detailedResults,
      });

      return res.status(201).json({
        message: "Manual test saved successfully",
        score: finalScore,
        total: finalTotal,
        detailedResults,
      });
    }

    // 🟢 EXISTING FLOW FOR OTHER TYPES
    let filter = { subjectId };
    let selectionLimit = null;

    if (testType === "chapter") {
      if (!courseId || !chapterId) {
        return res.status(400).json({ message: "courseId and chapterId are required for chapter tests" });
      }

      const chapter = await Chapter.findById(chapterId);
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });

      const limitSet = chapter.attemptLimit !== null && chapter.attemptLimit !== undefined;
      const maxAttempts = limitSet ? Number(chapter.attemptLimit) : null;
      if (limitSet && maxAttempts === 0) {
        return res.status(403).json({ message: "Attempt limit reached (0 attempts allowed)" });
      }

      let attemptDoc = null;
      if (limitSet) {
        attemptDoc = await TestAttempt.findOneAndUpdate(
          { user: userId, courseId, chapterId, testType, attemptCount: { $lt: maxAttempts } },
          { $inc: { attemptCount: 1 } },
          { new: true }
        );
        if (!attemptDoc) {
          const existing = await TestAttempt.findOne({ user: userId, courseId, chapterId, testType });
          if (existing) {
            return res.status(403).json({ message: `Attempt limit reached (${maxAttempts} allowed)` });
          }
          attemptDoc = await TestAttempt.findOneAndUpdate(
            { user: userId, courseId, chapterId, testType },
            { $setOnInsert: { attemptCount: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
        }
      } else {
        attemptDoc = await TestAttempt.findOneAndUpdate(
          { user: userId, courseId, chapterId, testType },
          { $inc: { attemptCount: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }

      filter.courseId = courseId;
      filter.chapterId = chapterId;
      selectionLimit = null;
      req._attemptDoc = attemptDoc;
    } else if (testType === "free") {
      selectionLimit = FREE_MODE_LIMIT;
    } else if (testType === "master") {
      if (!courseId) {
        return res.status(400).json({ message: "courseId is required for master tests" });
      }
      filter.courseId = courseId;
      selectionLimit = MASTER_MODE_LIMIT;
    } else {
      return res.status(400).json({ message: "Invalid testType" });
    }

    // Fetch questions
    let questions = await Question.find(filter).lean();
    if (!questions.length) {
      if (testType === "chapter" && req._attemptDoc?._id) {
        await TestAttempt.updateOne(
          { _id: req._attemptDoc._id, attemptCount: { $gt: 0 } },
          { $inc: { attemptCount: -1 } }
        );
      }
      return res.status(404).json({ message: "No questions found" });
    }

    if (selectionLimit && questions.length > selectionLimit) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
      questions = questions.slice(0, selectionLimit);
    }

    const safeAnswer = (v) => Number.isInteger(v) && v >= 0 && v <= 3 ? v : null;
    let correctCount = 0;
    detailedResults = questions.map((q, i) => {
      const userAnswer = safeAnswer(answers[i]);
      const isCorrect = userAnswer !== null && userAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;
      return {
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        userAnswer,
        isCorrect,
      };
    });

    finalScore = correctCount;
    finalTotal = questions.length;

    await TestResult.create({
      user: userId,
      courseId: testType === "free" ? null : courseId || null,
      chapterId: testType === "chapter" ? chapterId : null,
      subjectId,
      score: finalScore,
      total: finalTotal,
      testType,
      details: detailedResults,
    });

    const attemptCount =
      testType === "chapter" && req._attemptDoc ? req._attemptDoc.attemptCount : undefined;

    return res.status(201).json({
      message: "Test submitted successfully",
      score: finalScore,
      total: finalTotal,
      detailedResults,
      ...(attemptCount !== undefined ? { attemptCount } : {}),
    });

  } catch (err) {
    console.error("Submit test error:", err);
    return res.status(500).json({ message: "Error processing test submission" });
  }
};
