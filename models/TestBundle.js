// models/TestBundle.js
//
// A TestBundle is a question-paper bundle used by "test_series" courses.
// Admin groups questions into a named paper (e.g. "Paper 1 — Full Syllabus"),
// sets duration, marks per question, and controls access.
//
// Questions are stored as references to the Question model — so the same
// question bank used for standard chapter tests feeds these bundles too.

import mongoose from "mongoose";

const testBundleSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },

    // ---- Paper type ----
    // chapter  → linked to a specific subject + chapter (regular test)
    // weekly   → weekly mock paper
    // monthly  → monthly mock paper
    // full     → full-syllabus mock exam
    paperType: {
      type:    String,
      enum:    ["chapter", "weekly", "monthly", "full"],
      default: "full",
      index:   true,
    },

    // Optional links for chapter-level bundles
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },

    // ---- Bundle type ----
    // mcq  → in-app timed MCQ exam (uses questionIds + test player)
    // pdf  → downloadable/viewable PDF answer key / question paper
    // doc  → downloadable Word document
    bundleType: {
      type:    String,
      enum:    ["mcq", "pdf", "doc"],
      default: "mcq",
      index:   true,
    },

    // URL for pdf / doc bundles (S3 URL or any public URL)
    materialUrl: { type: String, default: "" },

    // ---- Questions (MCQ bundles only) ----
    // Ordered array; student sees them in this order
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],

    // ---- Test settings (MCQ bundles only) ----
    durationMinutes: { type: Number, default: 90, min: 1 },
    marksPerCorrect: { type: Number, default: 1, min: 0 },
    negativeMarks:   { type: Number, default: 0, min: 0 }, // per wrong answer

    // ---- Access ----
    // all  → any enrolled student (free + paid)
    // paid → only paid students
    access: {
      type:    String,
      enum:    ["all", "paid"],
      default: "paid",
    },

    // Attempt limit per student (null = unlimited)
    attemptLimit: { type: Number, default: null, min: 0 },

    // ---- Publishing & scheduling ----
    isPublished:    { type: Boolean, default: false },
    availableFrom:  { type: Date, default: null },
    availableUntil: { type: Date, default: null },

    // Sort order within the course
    sortOrder: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

testBundleSchema.index({ courseId: 1, sortOrder: 1 });
testBundleSchema.index({ courseId: 1, paperType: 1 });

export default mongoose.model("TestBundle", testBundleSchema);
