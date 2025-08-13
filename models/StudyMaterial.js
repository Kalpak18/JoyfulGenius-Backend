// // models/StudyMaterial.js
// import mongoose from 'mongoose';

// const fileSchema = new mongoose.Schema({
//   fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   fileName: String,
//   mimeType: String,
//   size: Number,
//   allowDownload: { type: Boolean, default: false }
// });

// const studyMaterialSchema = new mongoose.Schema({
//   courseName: { type: String, required: true },
//   subjectName: { type: String, required: true },
//   topicName: { type: String, required: true },
//   files: [fileSchema],
//   youtubeLinks: [String],
//   uploadedAt: { type: Date, default: Date.now }
// });

// export default mongoose.model('StudyMaterial', studyMaterialSchema);


// models/StudyMaterial.js
import mongoose from "mongoose";

const StudyMaterialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      required: true
    },
    chapter: {
      type: String,
      required: true
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
      type: String // Only for YouTube type
    },
    downloadable: {
      type: Boolean,
      default: false
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // Or "User" if you allow users to upload
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("StudyMaterial", StudyMaterialSchema);
