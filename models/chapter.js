import mongoose from "mongoose";

const chapterSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
     subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true },
    language: { type: String, required: true, trim: true },
    youtubeCode: { type: String, default: "" },

    // "external" = testmoz/any URL via freetestCode; "inapp" = questions in DB
    freetestType:   { type: String, enum: ["external", "inapp"], default: "external" },
    freetestCode:   { type: String, default: "" },

    // "external" = testmoz/any URL via mastertestCode; "inapp" = questions in DB
    mastertestType: { type: String, enum: ["external", "inapp"], default: "external" },
    mastertestCode: { type: String, default: "" },
    
    // Admin-controlled attempt limit (null = unlimited)
    attemptLimit: {
      type: Number,
      min: [0, "Attempt limit must be a non-negative number"],
      default: null,
    },

    // ---- Test scheduling type ----
    // chapter  → regular chapter test (default)
    // weekly   → admin-scheduled weekly test
    // monthly  → admin-scheduled monthly test
    testScheduleType: {
      type:    String,
      enum:    ["chapter", "weekly", "monthly"],
      default: "chapter",
    },

    // ---- Access control for this chapter's test ----
    // all  → free + paid students can attempt
    // paid → only paid students
    testAccess: {
      type:    String,
      enum:    ["all", "paid"],
      default: "paid",
    },

    // Optional: window during which the test is available (null = always)
    availableFrom:  { type: Date, default: null },
    availableUntil: { type: Date, default: null },

    // Ordering within a subject
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique only inside the same course
chapterSchema.index(
  { courseId: 1, subjectId: 1, title: 1 },
  { unique: true }
);
chapterSchema.index({ courseId: 1, subjectId: 1, sortOrder: 1 });


export default mongoose.model("Chapter", chapterSchema);
