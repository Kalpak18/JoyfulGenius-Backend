// models/Lecture.js
//
// A Lecture is a single piece of video content inside a Chapter.
// It can be one of two kinds:
//
//   1. youtube — stores a YouTube URL/ID; thumbnail auto-derived
//   2. upload  — stores an S3 video URL; thumbnail must be uploaded separately
//
// Multiple lectures per chapter, ordered by `sortOrder`.

import mongoose from "mongoose";

// Pull the 11-char video ID from any YouTube URL form
// (youtu.be/XXXX, youtube.com/watch?v=XXXX, embed/XXXX, shorts/XXXX, etc.)
export const extractYoutubeId = (url = "") => {
  if (!url) return "";
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : (String(url).match(/^[A-Za-z0-9_-]{11}$/) ? url : "");
};

const lectureSchema = new mongoose.Schema(
  {
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },

    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },

    kind: { type: String, enum: ["youtube", "upload"], required: true },

    // ── YouTube path ──
    // Either a full URL or a bare 11-char video id; we normalize to ID on save.
    youtubeId: { type: String, default: "" },

    // ── Direct upload path ──
    // Both URLs point to S3. Thumbnail is REQUIRED for kind=upload
    // (validated in the controller, not the schema, so admins can save
    // partial drafts).
    videoUrl:     { type: String, default: "" }, // mp4 / m3u8 hosted on S3
    videoKey:     { type: String, default: "" }, // S3 key (for cleanup on delete)
    thumbnailUrl: { type: String, default: "" }, // jpg / png hosted on S3
    thumbnailKey: { type: String, default: "" }, // S3 key (for cleanup on delete)

    durationSec: { type: Number, default: 0, min: 0 }, // optional, set by uploader

    sortOrder:   { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },

    // Soft delete — never actually erase content; admins can restore.
    deletedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

lectureSchema.index({ chapterId: 1, sortOrder: 1 });
lectureSchema.index({ chapterId: 1, deletedAt: 1, sortOrder: 1 });
lectureSchema.index({ courseId: 1, isPublished: 1 });

// Normalize YouTube link → 11-char ID so the player can embed it directly.
lectureSchema.pre("save", function (next) {
  if (this.kind === "youtube" && this.youtubeId) {
    const id = extractYoutubeId(this.youtubeId);
    if (id) this.youtubeId = id;
  }
  next();
});

// Virtual: best thumbnail to show (YouTube auto-thumb or uploaded one)
lectureSchema.virtual("thumbnail").get(function () {
  if (this.kind === "youtube" && this.youtubeId) {
    return `https://i.ytimg.com/vi/${this.youtubeId}/hqdefault.jpg`;
  }
  return this.thumbnailUrl || "";
});

lectureSchema.set("toJSON",   { virtuals: true });
lectureSchema.set("toObject", { virtuals: true });

export default mongoose.model("Lecture", lectureSchema);
