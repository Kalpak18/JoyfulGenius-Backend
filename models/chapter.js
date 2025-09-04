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
    freetestCode: { type: String, default: "" },
    mastertestCode: { type: String, default: "" },
    
    // New field for admin to control attempts
      attemptLimit: {
      type: Number,
      min: [0, "Attempt limit must be a non-negative number"],
      default: null, // null = unlimited in API response
    },
  },
  { timestamps: true }
);

// Unique only inside the same course
chapterSchema.index(
  { courseId: 1, subjectId: 1, title: 1 },
  { unique: true }
);


export default mongoose.model("Chapter", chapterSchema);
