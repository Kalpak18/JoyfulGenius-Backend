// controllers/builderController.js
//
// Sections + ContentBlocks for v2 (flexible) courses.
//
//   Admin endpoints (verifyAdmin + tutor scope):
//     POST   /api/admin/sections                       create
//     PATCH  /api/admin/sections/:id                   update
//     DELETE /api/admin/sections/:id                   delete (cascades blocks)
//     POST   /api/admin/sections/reorder               { courseId, orderedIds[] }
//
//     POST   /api/admin/blocks                         create
//     PATCH  /api/admin/blocks/:id                     update
//     DELETE /api/admin/blocks/:id                     delete
//     POST   /api/admin/blocks/reorder                 { sectionId, orderedIds[] }
//
//   Student endpoints (protect, requires paid access):
//     GET    /api/courses/:courseId/builder            full course structure for v2 courses
//
// Block payload validation is per-kind (see validatePayload below).

import mongoose from "mongoose";
import Course        from "../models/Course.js";
import Section       from "../models/Section.js";
import ContentBlock, { VALID_BLOCK_KINDS } from "../models/ContentBlock.js";
import User          from "../models/User.js";

// ── helpers ──────────────────────────────────────────────────────────────

async function userHasPaidCourse(userId, courseId) {
  const user = await User.findById(userId).select("paidCourses").lean();
  if (!user) return false;
  return user.paidCourses.some(
    pc => pc.courseId?.toString() === courseId?.toString() && pc.isPaid
  );
}

// Validate + normalize a block payload. Returns the cleaned payload, or throws.
function validatePayload(kind, payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  switch (kind) {
    case "video": {
      const sub = p.kind === "upload" ? "upload" : "youtube";
      return {
        kind:         sub,
        youtubeId:    sub === "youtube" ? String(p.youtubeId || "").trim() : "",
        videoUrl:     sub === "upload"  ? String(p.videoUrl  || "").trim() : "",
        videoKey:     sub === "upload"  ? String(p.videoKey  || "").trim() : "",
        thumbnailUrl: String(p.thumbnailUrl || "").trim(),
        durationSec:  Number.isFinite(p.durationSec) ? Math.max(0, Math.floor(p.durationSec)) : 0,
      };
    }
    case "text": {
      return { html: String(p.html || "").slice(0, 50_000) };
    }
    case "pdf": {
      return {
        url:      String(p.url || "").trim(),
        fileName: String(p.fileName || "").slice(0, 200),
      };
    }
    case "external": {
      return {
        url:   String(p.url   || "").trim(),
        title: String(p.title || "").slice(0, 200),
      };
    }
    case "quiz_ref": {
      if (p.chapterId && !mongoose.isValidObjectId(p.chapterId)) throw new Error("Invalid chapterId");
      return {
        chapterId: p.chapterId || null,
        testType:  ["chapter","free_inapp","master_inapp"].includes(p.testType) ? p.testType : "chapter",
      };
    }
    case "assignment_ref": {
      if (p.assignmentId && !mongoose.isValidObjectId(p.assignmentId)) throw new Error("Invalid assignmentId");
      return { assignmentId: p.assignmentId || null };
    }
    default:
      throw new Error(`Unknown block kind: ${kind}`);
  }
}

// ── Sections ─────────────────────────────────────────────────────────────

export const createSection = async (req, res) => {
  try {
    const { courseId, title, description = "", access = "paid" } = req.body || {};
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Valid courseId required" });
    }
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });

    const course = await Course.findById(courseId).select("_id").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Append at end
    const last = await Section.findOne({ courseId }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    const doc = await Section.create({
      courseId,
      title:       title.trim(),
      description: String(description).slice(0, 1000),
      access:      access === "free" ? "free" : "paid",
      sortOrder,
      createdBy:   req.admin?._id || null,
    });
    return res.status(201).json(doc);
  } catch (err) {
    console.error("createSection error:", err);
    return res.status(500).json({ message: "Failed to create section" });
  }
};

export const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const patch = {};
    for (const k of ["title", "description", "access", "isPublished"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.access && patch.access !== "free") patch.access = "paid";

    const doc = await Section.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(doc);
  } catch (err) {
    console.error("updateSection error:", err);
    return res.status(500).json({ message: "Failed to update section" });
  }
};

export const deleteSection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });
    const doc = await Section.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    await ContentBlock.deleteMany({ sectionId: id });
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteSection error:", err);
    return res.status(500).json({ message: "Failed to delete section" });
  }
};

export const reorderSections = async (req, res) => {
  try {
    const { courseId, orderedIds } = req.body || {};
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Valid courseId required" });
    }
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: "orderedIds[] required" });
    }
    const ops = orderedIds.map((id, idx) =>
      mongoose.isValidObjectId(id)
        ? { updateOne: { filter: { _id: id, courseId }, update: { sortOrder: idx } } }
        : null
    ).filter(Boolean);
    if (ops.length) await Section.bulkWrite(ops);
    return res.json({ ok: true });
  } catch (err) {
    console.error("reorderSections error:", err);
    return res.status(500).json({ message: "Failed to reorder sections" });
  }
};

// ── Blocks ───────────────────────────────────────────────────────────────

export const createBlock = async (req, res) => {
  try {
    const { sectionId, kind, title, payload = {}, access = null } = req.body || {};
    if (!sectionId || !mongoose.isValidObjectId(sectionId)) {
      return res.status(400).json({ message: "Valid sectionId required" });
    }
    if (!VALID_BLOCK_KINDS.includes(kind)) {
      return res.status(400).json({ message: `Invalid kind. Allowed: ${VALID_BLOCK_KINDS.join(", ")}` });
    }
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });

    const section = await Section.findById(sectionId).select("courseId").lean();
    if (!section) return res.status(404).json({ message: "Section not found" });

    let cleanedPayload;
    try {
      cleanedPayload = validatePayload(kind, payload);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const last = await ContentBlock.findOne({ sectionId }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    const doc = await ContentBlock.create({
      sectionId,
      courseId: section.courseId,
      kind,
      title: title.trim(),
      access: access === "free" || access === "paid" ? access : null,
      sortOrder,
      payload: cleanedPayload,
    });
    return res.status(201).json(doc);
  } catch (err) {
    console.error("createBlock error:", err);
    return res.status(500).json({ message: "Failed to create block" });
  }
};

export const updateBlock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const existing = await ContentBlock.findById(id);
    if (!existing) return res.status(404).json({ message: "Not found" });

    const patch = {};
    for (const k of ["title", "isPublished", "access"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.access && patch.access !== "free" && patch.access !== "paid") patch.access = null;

    if (req.body.payload !== undefined) {
      try {
        patch.payload = validatePayload(existing.kind, req.body.payload);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    }

    const doc = await ContentBlock.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
    return res.json(doc);
  } catch (err) {
    console.error("updateBlock error:", err);
    return res.status(500).json({ message: "Failed to update block" });
  }
};

export const deleteBlock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });
    const doc = await ContentBlock.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteBlock error:", err);
    return res.status(500).json({ message: "Failed to delete block" });
  }
};

export const reorderBlocks = async (req, res) => {
  try {
    const { sectionId, orderedIds } = req.body || {};
    if (!sectionId || !mongoose.isValidObjectId(sectionId)) {
      return res.status(400).json({ message: "Valid sectionId required" });
    }
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: "orderedIds[] required" });
    }
    const ops = orderedIds.map((id, idx) =>
      mongoose.isValidObjectId(id)
        ? { updateOne: { filter: { _id: id, sectionId }, update: { sortOrder: idx } } }
        : null
    ).filter(Boolean);
    if (ops.length) await ContentBlock.bulkWrite(ops);
    return res.json({ ok: true });
  } catch (err) {
    console.error("reorderBlocks error:", err);
    return res.status(500).json({ message: "Failed to reorder blocks" });
  }
};

// ── Read: full course tree ───────────────────────────────────────────────

// GET /api/courses/:courseId/builder
// Returns: { course, sections: [ { ...section, blocks: [...] } ] }
// Filters out unpublished blocks/sections for students; admins see everything.
export const getCourseBuilderTree = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ message: "Invalid courseId" });

    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isAdminRequest = Boolean(req.admin?._id);
    if (!isAdminRequest) {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      // Free courses don't need paid check; paid courses do.
      const isFree = !course.priceINR || course.priceINR <= 0;
      if (!isFree) {
        const paid = await userHasPaidCourse(userId, courseId);
        if (!paid) return res.status(402).json({ message: "Purchase required", courseId });
      }
    }

    const sectionFilter = { courseId };
    if (!isAdminRequest) sectionFilter.isPublished = true;

    const sections = await Section.find(sectionFilter).sort({ sortOrder: 1 }).lean();
    const sectionIds = sections.map(s => s._id);

    const blockFilter = { sectionId: { $in: sectionIds } };
    if (!isAdminRequest) blockFilter.isPublished = true;

    const blocks = await ContentBlock.find(blockFilter).sort({ sortOrder: 1 }).lean();
    const blocksBySection = new Map();
    for (const b of blocks) {
      const key = b.sectionId.toString();
      if (!blocksBySection.has(key)) blocksBySection.set(key, []);
      blocksBySection.get(key).push(b);
    }

    return res.json({
      course,
      sections: sections.map(s => ({
        ...s,
        blocks: blocksBySection.get(s._id.toString()) || [],
      })),
    });
  } catch (err) {
    console.error("getCourseBuilderTree error:", err);
    return res.status(500).json({ message: "Failed to load course" });
  }
};
