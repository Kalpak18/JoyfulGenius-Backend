// controllers/lectureController.js
//
// Lectures live inside a Chapter and can be YouTube embeds OR direct uploads.
// All write endpoints are admin-only.

import mongoose from "mongoose";
import Lecture, { extractYoutubeId } from "../models/Lecture.js";
import Chapter from "../models/chapter.js";
import { adminCanWriteCourse } from "../middleware/tutorScope.js";
import {
  presignUpload,
  deleteS3Key,
  isS3Configured,
  ALLOWED_VIDEO_MIME,
  ALLOWED_IMAGE_MIME,
  MAX_VIDEO_BYTES,
  MAX_IMAGE_BYTES,
} from "../Utils/s3.js";

/* ===========================
   GET /api/lectures?chapterId=...
   Auth: protect (any logged-in user) — but draft lectures and chapters in
   unpublished courses are filtered out by the upstream paid-access check.
=========================== */
export const listLectures = async (req, res) => {
  try {
    const { chapterId, courseId } = req.query;
    if (!chapterId) return res.status(400).json({ message: "chapterId is required" });
    if (!mongoose.isValidObjectId(chapterId)) return res.status(400).json({ message: "Invalid chapterId" });

    const filter = { chapterId, deletedAt: null, isPublished: true };
    if (courseId && mongoose.isValidObjectId(courseId)) filter.courseId = courseId;

    const lectures = await Lecture.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean({ virtuals: true });
    return res.json(lectures);
  } catch (err) {
    console.error("listLectures error:", err);
    return res.status(500).json({ message: "Failed to list lectures" });
  }
};

/* ===========================
   GET /api/admin/lectures?chapterId=...
   Auth: verifyAdmin — sees drafts + unpublished too, bypasses paid-course gate.
=========================== */
export const listLecturesForAdmin = async (req, res) => {
  try {
    const { chapterId } = req.query;
    if (!chapterId || !mongoose.isValidObjectId(chapterId)) {
      return res.status(400).json({ message: "Valid chapterId is required" });
    }
    // Tutors can only list lectures in chapters that belong to their scoped courses.
    if (req.admin?.role === "tutor") {
      const chapter = await Chapter.findById(chapterId).select("courseId").lean();
      if (!chapter) return res.status(404).json({ message: "Chapter not found" });
      if (!(await adminCanWriteCourse(req.admin, chapter.courseId, req))) {
        return res.status(403).json({ message: "Tutors can only view their assigned courses" });
      }
    }
    const items = await Lecture.find({ chapterId, deletedAt: null })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean({ virtuals: true });
    return res.json(items);
  } catch (err) {
    console.error("listLecturesForAdmin error:", err);
    return res.status(500).json({ message: "Failed to list lectures" });
  }
};

/* ===========================
   POST /api/admin/lectures
   Auth: verifyAdmin
   Body: { chapterId, title, kind, youtubeId?, videoUrl?, videoKey?,
           thumbnailUrl?, thumbnailKey?, description?, durationSec?,
           sortOrder?, isPublished? }
=========================== */
export const createLecture = async (req, res) => {
  try {
    const {
      chapterId, title, kind,
      youtubeId, videoUrl, videoKey,
      thumbnailUrl, thumbnailKey,
      description, durationSec,
      sortOrder, isPublished,
    } = req.body || {};

    if (!chapterId || !title || !kind) {
      return res.status(400).json({ message: "chapterId, title, kind are required" });
    }
    if (!["youtube", "upload"].includes(kind)) {
      return res.status(400).json({ message: "kind must be 'youtube' or 'upload'" });
    }

    const chapter = await Chapter.findById(chapterId).select("courseId subjectId").lean();
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });

    if (kind === "youtube") {
      const id = extractYoutubeId(youtubeId || "");
      if (!id) return res.status(400).json({ message: "Provide a valid YouTube URL or 11-char ID" });
    } else if (kind === "upload") {
      if (!videoUrl) return res.status(400).json({ message: "videoUrl is required for uploaded lectures" });
      if (!thumbnailUrl) return res.status(400).json({ message: "A thumbnail is required for uploaded videos" });
    }

    const lecture = await Lecture.create({
      chapterId,
      courseId:  chapter.courseId,
      subjectId: chapter.subjectId,
      title:     String(title).trim(),
      kind,
      youtubeId:    kind === "youtube" ? extractYoutubeId(youtubeId) : "",
      videoUrl:     kind === "upload"  ? videoUrl     : "",
      videoKey:     kind === "upload"  ? videoKey     : "",
      thumbnailUrl: kind === "upload"  ? thumbnailUrl : "",
      thumbnailKey: kind === "upload"  ? thumbnailKey : "",
      description:  description || "",
      durationSec:  Number(durationSec) || 0,
      sortOrder:    Number(sortOrder)   || 0,
      isPublished:  isPublished !== false,
      createdBy:    req.admin?._id,
    });

    return res.status(201).json(lecture.toJSON({ virtuals: true }));
  } catch (err) {
    console.error("createLecture error:", err);
    return res.status(500).json({ message: err.message || "Failed to create lecture" });
  }
};

/* ===========================
   PATCH /api/admin/lectures/:id
=========================== */
export const updateLecture = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const lecture = await Lecture.findById(id);
    if (!lecture || lecture.deletedAt) return res.status(404).json({ message: "Lecture not found" });

    const allowed = [
      "title", "description", "youtubeId",
      "videoUrl", "videoKey", "thumbnailUrl", "thumbnailKey",
      "durationSec", "sortOrder", "isPublished",
    ];
    for (const k of allowed) {
      if (k in req.body) lecture[k] = req.body[k];
    }

    // If switching kind would orphan files, force the caller to be explicit.
    if (req.body.kind && req.body.kind !== lecture.kind) {
      return res.status(400).json({ message: "Cannot change lecture kind — delete and recreate instead" });
    }

    await lecture.save();
    return res.json(lecture.toJSON({ virtuals: true }));
  } catch (err) {
    console.error("updateLecture error:", err);
    return res.status(500).json({ message: "Failed to update lecture" });
  }
};

/* ===========================
   DELETE /api/admin/lectures/:id
   Soft-delete + best-effort S3 cleanup.
=========================== */
export const deleteLecture = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const lecture = await Lecture.findById(id);
    if (!lecture) return res.status(404).json({ message: "Lecture not found" });

    lecture.deletedAt = new Date();
    await lecture.save();

    if (lecture.kind === "upload") {
      // Fire-and-forget; we don't want a slow S3 call to block the response.
      if (lecture.videoKey)     deleteS3Key(lecture.videoKey).catch(() => {});
      if (lecture.thumbnailKey) deleteS3Key(lecture.thumbnailKey).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteLecture error:", err);
    return res.status(500).json({ message: "Failed to delete lecture" });
  }
};

/* ===========================
   PATCH /api/admin/lectures/reorder
   Body: { chapterId, order: [lectureId, lectureId, ...] }
=========================== */
export const reorderLectures = async (req, res) => {
  try {
    const { chapterId, order } = req.body || {};
    if (!chapterId || !Array.isArray(order)) {
      return res.status(400).json({ message: "chapterId and order[] required" });
    }

    const ops = order.map((lectureId, idx) => ({
      updateOne: {
        filter: { _id: lectureId, chapterId },
        update: { $set: { sortOrder: idx } },
      },
    }));
    if (ops.length) await Lecture.bulkWrite(ops);
    return res.json({ ok: true, count: ops.length });
  } catch (err) {
    console.error("reorderLectures error:", err);
    return res.status(500).json({ message: "Failed to reorder" });
  }
};

/* ===========================
   POST /api/admin/uploads/presign
   Body: { kind: "video" | "image", filename, contentType, sizeBytes }
   Auth: verifyAdmin
   ───────────────────────────
   Returns a short-lived URL the browser can PUT the file to directly.
=========================== */
export const presignUploadController = async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({ message: "Uploads are not configured on the server (missing AWS_S3_*)." });
    }
    const { kind, filename, contentType, sizeBytes } = req.body || {};
    if (!["video", "image"].includes(kind)) {
      return res.status(400).json({ message: "kind must be 'video' or 'image'" });
    }
    if (!filename || !contentType) {
      return res.status(400).json({ message: "filename and contentType are required" });
    }

    if (kind === "video") {
      if (!ALLOWED_VIDEO_MIME.has(contentType)) {
        return res.status(415).json({ message: `Unsupported video type: ${contentType}` });
      }
      if (sizeBytes && sizeBytes > MAX_VIDEO_BYTES) {
        return res.status(413).json({ message: `Video too large (max ${MAX_VIDEO_BYTES / 1e9} GB)` });
      }
    } else {
      if (!ALLOWED_IMAGE_MIME.has(contentType)) {
        return res.status(415).json({ message: `Unsupported image type: ${contentType}` });
      }
      if (sizeBytes && sizeBytes > MAX_IMAGE_BYTES) {
        return res.status(413).json({ message: `Image too large (max ${MAX_IMAGE_BYTES / 1e6} MB)` });
      }
    }

    const presigned = await presignUpload({
      kind:        kind === "video" ? "video" : "image",
      filename,
      contentType,
    });
    if (!presigned) return res.status(503).json({ message: "Presign failed" });

    return res.json(presigned);
  } catch (err) {
    console.error("presignUpload error:", err);
    return res.status(500).json({ message: "Failed to presign upload" });
  }
};
