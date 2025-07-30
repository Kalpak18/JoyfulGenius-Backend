// import TestAttempt from '../models/testAttempts.js';

// export const saveTestResult = async (req, res) => {
//   try {
//     const newResult = new TestAttempt(req.body);
//     await newResult.save();
//     res.status(201).json({ message: "Test result saved", result: newResult });
//   } catch (err) {
//     console.error("Save test result failed:", err);
//     res.status(500).json({ message: "Failed to save test result" });
//   }
// };

// export const getUserTestResults = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const results = await TestAttempt.find({ userId }).sort({ attemptedAt: -1 });
//     res.json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Failed to get test history" });
//   }
// };
// // // controllers/testController.js

// import Question from "../models/Question.js";

// export const submitTest = async (req, res) => {
//   const userId = req.user.id;
//   const { subject, chapter, answers } = req.body;

//   try {
//     const questions = await Question.find({ subject, chapter });

//     let score = 0;
//     const feedback = [];

//     questions.forEach((q) => {
//       const userAnswer = answers[q._id];
//       const correct = q.correctAnswer === userAnswer;
//       if (correct) score++;
//       feedback.push({
//         question: q.question,
//         options: q.options,
//         correctAnswer: q.correctAnswer,
//         userAnswer,
//         isCorrect: correct,
//       });
//     });

//     res.status(200).json({
//       success: true,
//       message: "Test submitted",
//       score,
//       total: questions.length,
//       feedback,
//       subject,
//       chapter,
//       userId,
//     });
//   } catch (err) {
//     console.error("Submit test failed:", err);
//     res.status(500).json({ error: "Server error during test submission" });
//   }
// };
import Question from '../models/question.js';

export const submitTest = async (req, res) => {
  const { subject, chapter, answers } = req.body;
  const userId = req.user.id;

  try {
    const questions = await Question.find({ subject, chapter });

    if (!questions.length) {
      return res.status(404).json({ message: "No questions found for this test." });
    }

    let correctCount = 0;
    const detailedResults = questions.map((question, index) => {
      const userAnswer = answers[index];
      const isCorrect = userAnswer === question.correctAnswer;

      if (isCorrect) correctCount++;

      return {
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        userAnswer,
        isCorrect,
      };
    });

    const score = correctCount;
    const total = questions.length;

    res.status(200).json({
      message: "Test submitted successfully",
      score,
      total,
      detailedResults,
    });
  } catch (err) {
    console.error("Submit test error:", err);
    res.status(500).json({ message: "Error processing test submission" });
  }
};
