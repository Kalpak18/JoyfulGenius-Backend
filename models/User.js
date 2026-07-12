// models/User.js
//
// One User = one human on the platform, across all courses. Their identity
// is their `handle` (Instagram-style unique platform-wide username). Legacy
// per-course username/serial fields have been removed — those made sense
// only when the platform was single-course.

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Per-course enrollment record. No username/serial here anymore — the
// student's platform-wide handle identifies them everywhere.
const paidCourseSchema = new mongoose.Schema({
  courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  isPaid:    { type: Boolean, default: false },

  progress: {
    completedLessons: { type: Number, default: 0 },
    totalLessons:     { type: Number, default: 0 },
  },
  // Resume state — last position the student was at inside this course.
  lastLectureId:  { type: mongoose.Schema.Types.ObjectId, ref: "Lecture", default: null },
  lastChapterId:  { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
  lastSubjectId:  { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
  lastAccessedAt: { type: Date, default: null },
  // Per-lecture completion (set of lecture ObjectIds).
  completedLectureIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lecture" }],
  testResults: [
    {
      testId:      String,
      score:       Number,
      attemptedAt: { type: Date, default: Date.now },
    },
  ],
  joinedAt: { type: Date, default: Date.now },
  paidAt:   { type: Date },
});

const userSchema = new mongoose.Schema(
  {
    // Human-readable identity
    f_name:    { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },

    // Platform-wide handle. Instagram / Twitter style: one per user, unique
    // across the whole platform, immutable-ish (users can rename via a
    // dedicated endpoint that also checks availability). Lower-case for
    // case-insensitive uniqueness. Generated automatically when not
    // supplied by the client.
    handle: {
      type:     String,
      unique:   true,
      sparse:   true,   // allows null while we back-fill
      trim:     true,
      lowercase:true,
      minlength: 3,
      maxlength: 24,
      // Letters, digits, underscore, period. No spaces. No hyphen (looks like a URL).
      match:    [/^[a-z0-9_.]{3,24}$/, "Handle must be 3–24 chars, lowercase letters/digits/_/. only"],
      index:    true,
    },

    email: {
      type:      String,
      lowercase: true,
      trim:      true,
      unique:    true,
      sparse:    true,
    },
    whatsappNo: {
      type:     String,
      required: true,
      unique:   true,
      set:      v => (v ? v.replace(/\D/g, "").slice(-10) : v),
    },
    district: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    verified: { type: Boolean, default: true },

    // Courses the user paid for
    paidCourses: { type: [paidCourseSchema], default: [] },

    // Courses the user is enrolled in (visited)
    enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],

    // Lectures the student saved for later. Capped at 500 entries app-side.
    bookmarks: [{
      lectureId: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture", required: true },
      courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true },
      chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
      title:     { type: String, default: "", maxlength: 200 }, // denormalized for fast list
      note:      { type: String, default: "", maxlength: 500 },
      createdAt: { type: Date,   default: Date.now },
    }],

    // Issued on 100% lecture completion. Idempotent — same course = same certNumber.
    certificates: [{
      courseId:        { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
      courseName:      { type: String, default: "" },
      certNumber:      { type: String, required: true }, // human-readable ID
      // Student confirms the name on their certificate at generation time.
      certificateName: { type: String, default: "", maxlength: 100 },
      issuedAt:        { type: Date,   default: Date.now },
    }],

    resetToken:       String,
    resetTokenExpire: Date,
    otpLastSentAt:    { type: Date },
    tokenVersion:     { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

userSchema.index({ "paidCourses.courseId": 1, "paidCourses.isPaid": 1 });
userSchema.index({ enrolledCourses: 1 });
userSchema.index({ resetToken: 1 }, { sparse: true });

// Pre-save hook: trim + hash password
userSchema.pre("save", async function (next) {
  Object.keys(userSchema.paths).forEach(path => {
    const field = userSchema.paths[path];
    if (
      field.options.trim &&
      typeof this[path] === "string" &&
      path !== "password"
    ) {
      this[path] = this[path].trim();
    }
  });

  // Skip hashing when the caller has already hashed the password
  // (used by the email-OTP registration flow that pre-hashes in pendingRegistrations).
  if (this.isModified("password") && !this.$skipPasswordHash) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Password check
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user has paid for a course
userSchema.methods.hasPaidForCourse = function (courseId) {
  return this.paidCourses.some(
    pc => pc.courseId?.toString() === courseId?.toString() && pc.isPaid
  );
};

export default mongoose.model("User", userSchema);
