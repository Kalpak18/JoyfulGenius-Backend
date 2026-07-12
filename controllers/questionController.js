// controllers/questionController.js
import Course from "../models/Course.js";
import Subject from "../models/subject.js";
import Chapter from "../models/chapter.js";
import Question from "../models/question.js";

// Helper to validate course → subject → chapter
const validateHierarchy = async (courseId, subjectId, chapterId) => {
  const subject = await Subject.findById(subjectId);
  if (!subject) throw new Error("Subject not found");
  if (subject.courseId.toString() !== courseId)
    throw new Error("Subject does not belong to the selected course");

  const chapter = await Chapter.findById(chapterId);
  if (!chapter) throw new Error("Chapter not found");
  if (chapter.subjectId.toString() !== subjectId)
    throw new Error("Chapter does not belong to the selected subject");
  if (chapter.courseId.toString() !== courseId)
    throw new Error("Chapter does not belong to the selected course");
};

export const addQuestion = async (req, res) => {
  try {
    const { subjectId, chapterId, courseId, question, questionImage, options, optionImages, correctAnswer, explanation } = req.body;

    await validateHierarchy(courseId, subjectId, chapterId);

    const newQuestion = new Question({
      subjectId, chapterId, courseId,
      question, questionImage: questionImage || "",
      options,
      optionImages: optionImages || ["", "", "", ""],
      correctAnswer,
      explanation: explanation || "",
    });
    await newQuestion.save();

    res.status(201).json({ message: "Question added successfully", data: newQuestion });
  } catch (err) {
    console.error("Add question error:", err);
    res.status(400).json({ message: err.message || "Internal server error" });
  }
};

// Add question
// export const addQuestion = async (req, res) => {
//   try {
//     const { subjectId, chapterId, courseId, question, options, correctAnswer } = req.body;

//     const newQuestion = new Question({
//       subjectId,
//       chapterId,
//       courseId,
//       question,
//       options,
//       correctAnswer,
//     });

//     await newQuestion.save();

//     res.status(201).json({
//       message: "Question added successfully",
//       data: newQuestion
//     });
//   } catch (err) {
//     console.error("Add question error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// Get questions (supports ?limit=number&random=true)
export const getQuestions = async (req, res) => {
  try {
    const { subjectId, chapterId, courseId, limit, random } = req.query;

    const filter = {};
    if (subjectId) filter.subjectId = subjectId;
    if (chapterId) filter.chapterId = chapterId;
    if (courseId) filter.courseId = courseId;

    let questions = await Question.find(filter).lean();

    if (!questions.length) {
      return res.status(404).json({ message: "No questions found" });
    }

    const lim = limit ? Math.max(1, Math.min(questions.length, Number(limit))) : null;
    if (lim) {
      if (random === "true") {
        // shuffle array
        for (let i = questions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questions[i], questions[j]] = [questions[j], questions[i]];
        }
      }
      questions = questions.slice(0, lim);
    }

    res.json(questions);
  } catch (error) {
    console.error("Get question error:", error);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
};

// Delete question
export const deleteQuestion = async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
};

// Update question
export const updateQuestion = async (req, res) => {
  try {
    const { question, questionImage, options, optionImages, correctAnswer, explanation, subjectId, chapterId, courseId } = req.body;

    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      {
        question, options, correctAnswer, subjectId, chapterId, courseId,
        ...(questionImage !== undefined && { questionImage }),
        ...(optionImages   !== undefined && { optionImages }),
        ...(explanation    !== undefined && { explanation }),
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.json({
      message: "Question updated successfully",
      data: updated
    });
  } catch (error) {
    console.error("Update question error:", error);
    res.status(500).json({ message: "Failed to update question" });
  }
};

// Bulk import questions from parsed CSV rows
// Body: { courseId, subjectId, chapterId, rows: [ { question, questionImage?, option1..4, optionImage1..4?, correctAnswer (1-4) } ] }
export const bulkImportQuestions = async (req, res) => {
  try {
    const { courseId, subjectId, chapterId, rows } = req.body;

    if (!courseId || !subjectId || !chapterId) {
      return res.status(400).json({ message: "courseId, subjectId, chapterId are required" });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "rows[] is required and must not be empty" });
    }

    await validateHierarchy(courseId, subjectId, chapterId);

    const docs = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // +2 because row 1 is header
      const q = (row.question || "").trim();
      const opts = [
        (row.option1 || row.Option1 || "").trim(),
        (row.option2 || row.Option2 || "").trim(),
        (row.option3 || row.Option3 || "").trim(),
        (row.option4 || row.Option4 || "").trim(),
      ];
      const correctRaw = row.correctAnswer ?? row.correct_answer ?? row.answer ?? "";
      const correct = Number(correctRaw);

      if (!q)                           { errors.push(`Row ${rowNum}: question is empty`); return; }
      if (opts.some(o => !o))           { errors.push(`Row ${rowNum}: one or more options are empty`); return; }
      if (![1,2,3,4].includes(correct)) { errors.push(`Row ${rowNum}: correctAnswer must be 1-4, got "${correctRaw}"`); return; }

      docs.push({
        courseId, subjectId, chapterId,
        question: q,
        questionImage: (row.questionImage || row.question_image || "").trim(),
        options: opts,
        optionImages: [
          (row.optionImage1 || row.option_image1 || "").trim(),
          (row.optionImage2 || row.option_image2 || "").trim(),
          (row.optionImage3 || row.option_image3 || "").trim(),
          (row.optionImage4 || row.option_image4 || "").trim(),
        ],
        correctAnswer: correct - 1, // convert 1-based → 0-based
        explanation: (row.explanation || row.Explanation || "").trim().slice(0, 2000),
      });
    });

    if (docs.length === 0) {
      return res.status(400).json({ message: "No valid rows found", errors });
    }

    const inserted = await Question.insertMany(docs, { ordered: false });

    res.status(201).json({
      message: `${inserted.length} question(s) imported successfully`,
      imported: inserted.length,
      skipped: rows.length - inserted.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    if (err.insertedDocs) {
      return res.status(207).json({ message: "Partial import", inserted: err.insertedDocs.length, error: err.message });
    }
    res.status(500).json({ message: err.message || "Bulk import failed" });
  }
};

// Get unique subject/chapter metadata
// export const getQuestionMetadata = async (req, res) => {
//   try {
//     const metadata = await Question.aggregate([
//       {
//         $group: {
//           _id: { subjectId: "$subjectId", chapterId: "$chapterId" }
//         }
//       }
//     ]);

//     const populatedMetadata = await Promise.all(
//       metadata.map(async (item) => {
//         const populated = await Question.populate(item, [
//           { path: "_id.chapterId", select: "title" },
//           { path: "_id.subjectId", select: "name" }
//         ]);

//         return {
//           subject: populated._id.subjectId?.name || null,
//           chapter: populated._id.chapterId?.title || null
//         };
//       })
//     );

//     res.json({ message: "Metadata fetched successfully", data: populatedMetadata });
//   } catch (err) {
//     console.error("Metadata fetch error:", err);
//     res.status(500).json({ message: "Error fetching question metadata" });
//   }
// };

export const getQuestionMetadata = async (req, res) => {
  try {
    const metadata = await Question.find()
      .populate("subjectId", "name courseId")
      .populate("chapterId", "title subjectId courseId")
      .populate("courseId", "name")
      .lean();

    // Build unique course → subject → chapter list
    const result = metadata.map(q => ({
      course: q.courseId?.name || null,
      courseId: q.courseId?._id || null,
      subject: q.subjectId?.name || null,
      subjectId: q.subjectId?._id || null,
      chapter: q.chapterId?.title || null,
      chapterId: q.chapterId?._id || null,
    }));

    // Remove duplicates
    const unique = Array.from(new Map(result.map(i => [i.chapterId, i])).values());

    res.json({ message: "Metadata fetched successfully", data: unique });
  } catch (err) {
    console.error("Metadata fetch error:", err);
    res.status(500).json({ message: "Error fetching question metadata" });
  }
};
