// import Chapter from "../models/chapter.js";
// import TestAttempt from "../models/testAttempts.js";

// // POST: Create or update chapter
// export const createOrUpdateChapter = async (req, res) => {
//   try {
//     const {
//       courseId,
//       subjectId,
//       title,
//       language,
//       youtubeCode,
//       freetestCode,
//       mastertestCode,
//       attemptLimit
//     } = req.body;

//     // Build update object dynamically
//     const updateData = {
//       language,
//       youtubeCode,
//       freetestCode,
//       mastertestCode,
//     };

//     if (attemptLimit !== undefined) {
//       updateData.attemptLimit = attemptLimit === null ? null : Number(attemptLimit);
//     }

//     const chapter = await Chapter.findOneAndUpdate(
//       { courseId, subjectId, title },
//       updateData,
//       { new: true, upsert: true, runValidators: true }
//     );

//     // If lowering limit, also adjust TestAttempt records for THIS chapter
//     if (attemptLimit !== undefined && attemptLimit !== null) {
//       await TestAttempt.updateMany(
//         {
//           courseId,
//           subjectId,
//           chapterId: chapter._id,
//           attemptCount: { $gt: attemptLimit }
//         },
//         { $set: { attemptCount: attemptLimit } }
//       );
//     }

//     res.status(200).json({ message: "Chapter saved", chapter });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res
//         .status(400)
//         .json({ message: "Chapter with this subject & title already exists in this course" });
//     }
//     console.error("Error saving chapter:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

import mongoose from "mongoose";
import Chapter from "../models/chapter.js";
import TestAttempt from "../models/testAttempts.js";


// Create or Update Chapter
export const createOrUpdateChapter = async (req, res) => {
  try {
    const {
      courseId,
      subjectId,
      title,
      language,
      youtubeCode,
      freetestCode,
      mastertestCode,
      attemptLimit
    } = req.body;

    // Validate required fields
    if (!courseId || !subjectId || !title || !language) {
      return res.status(400).json({
        message: "Course, Subject, Title, and Language are required"
      });
    }

    // Build dynamic update object
    const updateData = {
      language,
      youtubeCode: youtubeCode || "",
      freetestCode: freetestCode || "",
      mastertestCode: mastertestCode || ""
    };

    if (attemptLimit !== undefined && attemptLimit !== null) {
      updateData.attemptLimit = Number(attemptLimit);
    } else {
      updateData.attemptLimit = null; // default = unlimited
    }

    // Upsert chapter (create if not exists, update if exists)
    const chapter = await Chapter.findOneAndUpdate(
      { courseId, subjectId, title },
      updateData,
      { new: true, upsert: true, runValidators: true }
    );

    // Adjust TestAttempt records if attemptLimit is lowered
    if (attemptLimit !== undefined && attemptLimit !== null) {
      await TestAttempt.updateMany(
        {
          courseId,
          subjectId,
          chapterId: chapter._id,
          attemptCount: { $gt: updateData.attemptLimit }
        },
        { $set: { attemptCount: updateData.attemptLimit } }
      );
    }

    res.status(200).json({ message: "✅ Chapter saved successfully", chapter });
  } catch (error) {
    console.error("Error saving chapter:", error);

    // Handle duplicate key (unique index) errors
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Chapter with this title already exists for this course & subject"
      });
    }

    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// GET: All chapters for a course (optional filters)
export const getAllChapters = async (req, res) => {
  try {
    const { courseId, subjectId , subjectName } = req.query;

    const filter = {};
    // if (courseId) filter.courseId = courseId;
    // if (subjectId) filter.subjectId = subjectId;

      if (courseId && courseId.toString() === "YOUR_NMMS_COURSE_ID") {
      if (subjectId) {
        filter.courseId = courseId;
        filter.subjectId = subjectId;
      }
    }
     // Case 2: Generic dynamic (non-NMMS)
    else {
      if (subjectName) filter.title = new RegExp(subjectName, "i");
      if (courseId) filter.courseId = courseId;
      if (subjectId) filter.subjectId = subjectId;
    }
    
    const chapters = await Chapter.find(filter)
      .populate("courseId", "name")   // populate course name
      .populate("subjectId", "name")  // populate subject name
      .sort({ title: 1 });

    
       const formatted = chapters.map((ch) => ({
      _id: ch._id,
      title: ch.title,
      language: ch.language,
      youtubeCode: ch.youtubeCode,
      freetestCode: ch.freetestCode,
      mastertestCode: ch.mastertestCode,
      attemptLimit: ch.attemptLimit,
      courseName: ch.courseId?.name ?? "N/A",
      subjectName: ch.subjectId?.name ?? "N/A",
      courseId: ch.courseId?._id ?? ch.courseId,
      subjectId: ch.subjectId?._id ?? ch.subjectId,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching chapters:", error);
    res.status(500).json({ message: "Error fetching chapters" });
  }
};

// DELETE: Delete a chapter
export const deleteChapter = async (req, res) => {
  try {
    const { id } = req.params;
    await Chapter.findByIdAndDelete(id);
    res.status(200).json({ message: "Chapter deleted" });
  } catch (error) {
    console.error("Error deleting chapter:", error);
    res.status(500).json({ message: "Error deleting chapter" });
  }
};

// GET: Chapters by courseId + subjectId
export const getChaptersByCourseAndSubject = async (req, res) => {
  try {
    const { courseId, subjectId } = req.params;

    const chapters = await Chapter.find({ courseId, subjectId })
      .populate("courseId", "name")
      .populate("subjectId", "name")
      .sort({ title: 1 });

    res.status(200).json(chapters);
  } catch (error) {
    console.error("Error fetching NMMS chapters:", error);
    res.status(500).json({ message: "Error fetching NMMS chapters" });
  }
};
