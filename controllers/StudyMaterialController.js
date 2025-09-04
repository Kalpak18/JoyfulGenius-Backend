// controllers/materials.controller.js
import mongoose from "mongoose";
import StudyMaterial from "../models/StudyMaterial.js";
import { uploadFile, deleteFile } from "../services/gridfs.service.js";
import { getBucket } from "../config/gridfs.js";

/**
 * POST /api/materials
 */
export const createMaterial = async (req, res) => {
  try {
   const { courseId, subjectId, chapterId, title, type, downloadable, youtubeLink } = req.body;

if (!courseId || !subjectId || !chapterId || !title?.trim() || !type) {
  return res.status(400).json({ success: false, message: "courseId, subjectId, chapterId, title and type are required" });
}


    let fileId = null;

    // Upload file if not YouTube
    if (type !== "youtube") {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "File is required for pdf/video" });
      }
      fileId = await uploadFile(req.file, {
        courseId,
        subjectId,
        chapterId,
        title,
        type,
        downloadable: downloadable === "true" || downloadable === true,
      });
    } else {
      if (!youtubeLink?.trim()) {
        return res.status(400).json({ success: false, message: "youtubeLink is required for type 'youtube'" });
      }
    }

    const material = await StudyMaterial.create({
      courseId,
      subjectId,
      chapterId,
      title: title.trim(),
      type,
      fileId,
      youtubeLink: type === "youtube" ? youtubeLink.trim() : null,
      downloadable: downloadable === "true" || downloadable === true,
      uploadedBy: req.admin._id
    });

    return res.status(201).json({ success: true, data: material });
  } catch (err) {
    console.error("Create material error:", err);
    return res.status(500).json({ success: false, message: "Server error creating material" });
  }
};

export const listMaterials = async (req, res) => {
  try {
    const { courseId, subjectId, chapterId, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (courseId) filter.courseId = new mongoose.Types.ObjectId(courseId);
    if (subjectId) filter.subjectId = new mongoose.Types.ObjectId(subjectId);
    if (chapterId) filter.chapterId = new mongoose.Types.ObjectId(chapterId);

    // Fetch all filtered materials with lookups
    const materials = await StudyMaterial.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "chapters",
          localField: "chapterId",
          foreignField: "_id",
          as: "chapter",
        },
      },
      { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "subjects",
          localField: "subjectId",
          foreignField: "_id",
          as: "subject",
        },
      },
      { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          title: 1,
          type: 1,
          youtubeLink: 1,
          downloadable: 1,
          createdAt: 1,
          courseId: "$course._id",
          courseTitle: "$course.title",
          subjectId: "$subject._id",
          subject: "$subject.title",
          chapterId: "$chapter._id",
          chapterTitle: "$chapter.title",
        },
      },
    ]);

    // Group materials: Course → Subject → Chapter → Materials
    const coursesMap = {};

    materials.forEach((m) => {
      if (!coursesMap[m.courseId]) {
        coursesMap[m.courseId] = { courseId: m.courseId, courseTitle: m.courseTitle, subjects: {} };
      }

      if (!coursesMap[m.courseId].subjects[m.subjectId]) {
        coursesMap[m.courseId].subjects[m.subjectId] = { subjectId: m.subjectId, subject: m.subject, chapters: {} };
      }

      if (!coursesMap[m.courseId].subjects[m.subjectId].chapters[m.chapterId]) {
        coursesMap[m.courseId].subjects[m.subjectId].chapters[m.chapterId] = { chapterId: m.chapterId, chapterTitle: m.chapterTitle, materials: [] };
      }

      coursesMap[m.courseId].subjects[m.subjectId].chapters[m.chapterId].materials.push({
        _id: m._id,
        title: m.title,
        type: m.type,
        youtubeLink: m.youtubeLink,
        downloadable: m.downloadable,
        createdAt: m.createdAt,
        fileUrl: m.type !== "youtube" ? `/api/materials/${m._id}/stream` : null,
      });
    });

    // Convert map → array
    let groupedCourses = Object.values(coursesMap).map((course) => ({
      ...course,
      subjects: Object.values(course.subjects).map((subj) => ({
        ...subj,
        chapters: Object.values(subj.chapters),
      })),
    }));

    // Pagination applied after grouping
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCourses = groupedCourses.slice(startIndex, endIndex);

    res.status(200).json({
      totalCourses: groupedCourses.length,
      page: parseInt(page),
      limit: parseInt(limit),
      data: paginatedCourses,
    });
  } catch (error) {
    console.error("❌ Error listing materials:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/materials/:id
 */
export const getMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });
    return res.json({ success: true, data: material });
  } catch (err) {
    console.error("Get material error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching material" });
  }
};

/**
 * GET /api/materials/:id/stream
 */
export const streamMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });
    if (!material.fileId) return res.status(400).json({ success: false, message: "No file for this material" });

    const bucket = await getBucket();
    const _id = new mongoose.Types.ObjectId(material.fileId);
    const files = await bucket.find({ _id }).toArray();
    if (!files || !files.length) return res.status(404).json({ success: false, message: "File not found in GridFS" });

    const fileDoc = files[0];
    const contentType = fileDoc.contentType || (material.type === "pdf" ? "application/pdf" : "video/mp4");
    const filename = fileDoc.filename || material.title;

    if (contentType.startsWith("video") && req.headers.range) {
      const range = req.headers.range;
      const fileSize = fileDoc.length;
      const CHUNK_SIZE = 1 * 1024 * 1024;
      const start = Number(range.replace(/\D/g, ""));
      const end = Math.min(start + CHUNK_SIZE, fileSize - 1);
      const contentLength = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
      });

      bucket.openDownloadStream(_id, { start, end: end + 1 }).pipe(res);
      return;
    }

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
    });

    bucket.openDownloadStream(_id).pipe(res).on("error", (e) => {
      console.error("Stream error:", e);
      res.status(500).end();
    });
  } catch (err) {
    console.error("Stream route error:", err);
    return res.status(500).json({ success: false, message: "Server error streaming material" });
  }
};

/**
 * GET /api/materials/:id/download
 */
export const downloadMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });
    if (!material.downloadable) return res.status(403).json({ success: false, message: "Downloading not allowed" });
    if (!material.fileId) return res.status(400).json({ success: false, message: "No file to download" });

    const bucket = await getBucket();
    const _id = new mongoose.Types.ObjectId(material.fileId);
    const files = await bucket.find({ _id }).toArray();
    if (!files || !files.length) return res.status(404).json({ success: false, message: "File not found in GridFS" });

    const fileDoc = files[0];
    const filename = fileDoc.filename || `${material.title}`;

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });

    bucket.openDownloadStream(_id).pipe(res).on("error", (e) => {
      console.error("Download stream error:", e);
      res.status(500).end();
    });
  } catch (err) {
    console.error("Download route error:", err);
    return res.status(500).json({ success: false, message: "Server error downloading material" });
  }
};

/**
 * DELETE /api/materials/:id
 */
export const deleteMaterial = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: "Material not found" });

    if (material.fileId) {
      await deleteFile(material.fileId);
    }
    await material.deleteOne();
    return res.json({ success: true, message: "Material deleted" });
  } catch (err) {
    console.error("Delete material error:", err);
    return res.status(500).json({ success: false, message: "Server error deleting material" });
  }
};
