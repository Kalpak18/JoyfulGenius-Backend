// controllers/questionController.js
import Course from "../models/Course.js";
import Subject from "../models/Subject.js";
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
    const { subjectId, chapterId, courseId, question, options, correctAnswer } = req.body;

    await validateHierarchy(courseId, subjectId, chapterId);

    const newQuestion = new Question({ subjectId, chapterId, courseId, question, options, correctAnswer });
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
    const { question, options, correctAnswer, subjectId, chapterId, courseId } = req.body;

    const updated = await Question.findByIdAndUpdate(
      req.params.id,
      { question, options, correctAnswer, subjectId, chapterId, courseId },
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
