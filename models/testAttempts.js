import mongoose from "mongoose";

const testAttemptSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter" },

    // keep enum consistent with TestResult & controller
    testType:  { 
      type: String, 
      enum: ["chapter", "mock", "free", "master", "manual"], 
      default: "chapter" 
    },

    attemptCount: { type: Number, default: 0 },
    attemptedAt:  { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// quick lookup to count attempts
testAttemptSchema.index({ user: 1, courseId: 1, subjectId: 1, chapterId: 1, testType: 1 });

export default mongoose.model("TestAttempt", testAttemptSchema);
