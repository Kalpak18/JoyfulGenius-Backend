// models/Assignment.js
//
// Subjective assignments scoped to a course. Students submit a text answer;
// a tutor with matching subject scope, or a course admin/developer, grades
// it manually via the submissions panel.

import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true, index: true },
    subjectId:   { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null, index: true },
    chapterId:   { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },

    // "written"  → student types text answer, admin grades manually
    // "quiz"     → in-app MCQ, auto-graded immediately on submit
    // "surprise" → quiz hidden until availableFrom datetime
    assignmentType: {
      type: String,
      enum: ["written", "quiz", "surprise"],
      default: "written",
      index: true,
    },

    // MCQ fields — used when assignmentType is "quiz" or "surprise"
    questionIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    durationMinutes: { type: Number, default: 30, min: 1 },
    marksPerCorrect: { type: Number, default: 1, min: 0 },
    negativeMarks:   { type: Number, default: 0, min: 0 },

    // Access: "all" = any enrolled student, "paid" = paid only
    access: {
      type: String,
      enum: ["all", "paid"],
      default: "paid",
    },

    // For "surprise" type: hidden until this datetime
    availableFrom: { type: Date, default: null },

    title:       { type: String, required: true, trim: true, maxlength: 200 },

    // The question the student answers. Plain text; can be multi-paragraph.
    prompt:      { type: String, required: true, trim: true, maxlength: 5000 },

    // Optional model answer — shown to the grader. NEVER returned to the student.
    modelAnswer: { type: String, default: "", maxlength: 5000 },

    // Grading rubric — plain text describing what earns full marks vs partial.
    rubric:      { type: String, default: "", maxlength: 3000 },

    maxMarks:    { type: Number, required: true, min: 1, max: 100, default: 10 },

    // Cap student answer length.
    answerLimitChars: { type: Number, default: 3000, min: 100, max: 10000 },

    // draft  → invisible to students
    // open   → students can submit
    // closed → no new submissions; existing ones still gradeable
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
      index: true,
    },

    // Optional submission window
    dueAt:       { type: Date, default: null },

    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

assignmentSchema.index({ courseId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Assignment", assignmentSchema);
