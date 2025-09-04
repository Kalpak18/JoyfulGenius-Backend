import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  // Track status in this specific course
  visited: { type: Boolean, default: false },
  paid: { type: Boolean, default: false },

  // Username per course
  username: { type: String, default: "" },

  // Progress (optional)
  progress: {
    chaptersCompleted: { type: Number, default: 0 },
    lastAccessed: { type: Date, default: null },
  },

  // Tests/results scoped to this course
  testResults: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestResult" }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true }); // prevent duplicate enrollments

// Auto-update timestamp
enrollmentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("Enrollment", enrollmentSchema);
