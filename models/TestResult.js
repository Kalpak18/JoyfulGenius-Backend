import mongoose from "mongoose";

const detailSchema = new mongoose.Schema(
  {
    question:      { type: String, required: true },
    options:       { type: [String], required: true },
    correctAnswer: { type: Number, required: true, min: 0, max: 3 },
    userAnswer:    { type: Number, default: null, min: 0, max: 3 }, // null = skipped/unanswered
    isCorrect:     { type: Boolean, required: true },
    explanation:   { type: String, default: "" }, // shown on the post-test review screen
  },
  { _id: false }
);

const testResultSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course" }, // optional for free/manual
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter" }, // required only for chapter tests

    score:     { type: Number, required: true, min: 0 },
    total:     { type: Number, required: true, min: 1 },

    testType: {
      type: String,
      // bundle = a TestBundle paper (test_series course)
      enum: ["chapter", "mock", "free", "free_inapp", "master", "master_inapp", "manual", "bundle"],
      default: "chapter"
    },

    // For test_series courses — links result to a specific TestBundle paper
    bundleId: { type: mongoose.Schema.Types.ObjectId, ref: "TestBundle", default: null },

    // Time taken in seconds (set by frontend when user submits)
    timeTakenSec: { type: Number, default: null },

    details: { type: [detailSchema], default: [] },
  },
  { timestamps: true }
);

// helpful for per-user history screens
testResultSchema.index({ user: 1, createdAt: -1 });

// quick lookups for analytics (“how did this user do in this chapter”)
testResultSchema.index({ user: 1, courseId: 1, chapterId: 1, createdAt: -1 });

export default mongoose.model("TestResult", testResultSchema);
