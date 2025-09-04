import mongoose from "mongoose";

const StudyMaterialSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
     subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["pdf", "video", "youtube"],
      required: true
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId, // GridFS file reference
      ref: "fs.files"
    },
    youtubeLink: {
      type: String
    },
    downloadable: {
      type: Boolean,
      default: false
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true
    }
  },
  { timestamps: true }
);

// Validation: Require fileId for pdf/video, youtubeLink for youtube
StudyMaterialSchema.pre("validate", function (next) {
  if ((this.type === "pdf" || this.type === "video") && !this.fileId) {
    return next(new Error("File is required for PDF or video type study materials"));
  }
  if (this.type === "youtube" && !this.youtubeLink) {
    return next(new Error("YouTube link is required for YouTube type study materials"));
  }
  next();
});

export default mongoose.model("StudyMaterial", StudyMaterialSchema);
