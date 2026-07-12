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
      freetestType,
      freetestCode,
      mastertestType,
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
      youtubeCode:     youtubeCode     || "",
      freetestType:    freetestType    || "external",
      freetestCode:    freetestCode    || "",
      mastertestType:  mastertestType  || "external",
      mastertestCode:  mastertestCode  || "",
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


// PUT: Update chapter by ID
export const updateChapter = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      courseId, subjectId, title, language, youtubeCode,
      freetestType, freetestCode, mastertestType, mastertestCode, attemptLimit
    } = req.body;

    const updateData = {
      ...(courseId    && { courseId }),
      ...(subjectId   && { subjectId }),
      ...(title       && { title }),
      ...(language    && { language }),
      youtubeCode:     youtubeCode     ?? "",
      freetestType:    freetestType    || "external",
      freetestCode:    freetestType === "inapp" ? "" : (freetestCode    || ""),
      mastertestType:  mastertestType  || "external",
      mastertestCode:  mastertestType === "inapp" ? "" : (mastertestCode || ""),
      attemptLimit:    attemptLimit != null ? Number(attemptLimit) : null,
    };

    const chapter = await Chapter.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });
    res.status(200).json({ message: "Chapter updated", chapter });
  } catch (err) {
    console.error("Error updating chapter:", err);
    if (err.code === 11000) return res.status(400).json({ message: "A chapter with this title already exists for this course & subject" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET: All chapters for a course (optional filters)
export const getAllChapters = async (req, res) => {
  try {
    const { courseId, subjectId , subjectName } = req.query;

    const filter = {};
    if (subjectName) filter.title = new RegExp(subjectName, "i");
    if (courseId)    filter.courseId  = courseId;
    if (subjectId)   filter.subjectId = subjectId;
    
    const chapters = await Chapter.find(filter)
      .populate("courseId", "name")   // populate course name
      .populate("subjectId", "name")  // populate subject name
      .sort({ title: 1 });

    
       const formatted = chapters.map((ch) => ({
      _id: ch._id,
      title: ch.title,
      language: ch.language,
      youtubeCode:     ch.youtubeCode,
      freetestType:    ch.freetestType    || "external",
      freetestCode:    ch.freetestCode,
      mastertestType:  ch.mastertestType  || "external",
      mastertestCode:  ch.mastertestCode,
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
    console.error("Error fetching chapters:", error);
    res.status(500).json({ message: "Error fetching chapters" });
  }
};
