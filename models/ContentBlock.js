// models/ContentBlock.js
//
// One unit of content inside a Section. Kind drives which fields in `payload`
// the frontend should read.
//
//   video       → payload: { kind: "youtube"|"upload", youtubeId?, videoUrl?, videoKey?,
//                            thumbnailUrl?, durationSec? }
//   text        → payload: { html }                  — admin-authored HTML (rendered sanitized client-side)
//   pdf         → payload: { url, fileName }         — direct link (usually S3)
//   external    → payload: { url, title }            — opens in new tab
//   quiz_ref    → payload: { chapterId, testType }   — points at a chapter test in the legacy system
//   assignment_ref → payload: { assignmentId }       — points at an Assignment
//
// We treat payload as opaque JSON so we can add new block kinds without
// schema migrations. Validation is done in the controller per-kind.

import mongoose from "mongoose";

const BLOCK_KINDS = ["video", "text", "pdf", "external", "quiz_ref", "assignment_ref"];

const contentBlockSchema = new mongoose.Schema(
  {
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true, index: true },

    kind:      { type: String, enum: BLOCK_KINDS, required: true, index: true },
    title:     { type: String, required: true, trim: true, maxlength: 200 },
    sortOrder: { type: Number, default: 0 },

    // Per-block override of the section's access (null = inherit from section)
    access:    { type: String, enum: ["free", "paid", null], default: null },

    isPublished: { type: Boolean, default: true },

    // Opaque per-kind payload
    payload:   { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

contentBlockSchema.index({ sectionId: 1, sortOrder: 1 });
contentBlockSchema.index({ courseId: 1, sortOrder: 1 });

export const VALID_BLOCK_KINDS = BLOCK_KINDS;
export default mongoose.model("ContentBlock", contentBlockSchema);
