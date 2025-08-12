// models/StudyMaterial.js
import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileName: String,
  mimeType: String,
  size: Number,
  allowDownload: { type: Boolean, default: false }
});

const studyMaterialSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  subjectName: { type: String, required: true },
  topicName: { type: String, required: true },
  files: [fileSchema],
  youtubeLinks: [String],
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model('StudyMaterial', studyMaterialSchema);


// import mongoose from "mongoose";

// const studyMaterialSchema = new mongoose.Schema({
//   title: {
//     type: String,
//     required: true,
//   },
//   subject: {
//     type: String,
//     required: true,
//   },
//   type: {
//     type: String, // "pdf" or "video"
//     enum: ["pdf", "video"],
//     required: true,
//   },
//   allowDownload: { type: Boolean, default: false },

//   url: {
//     type: String, // PDF path or video link
//     required: true,
//   },
//   tags: {
//   type: [String],
//   required: false,
//   default: []
// },
//   // tags:  {
//   //   type: String, // PDF path or video link
//   //   required: true,
//   // },
//   category:  {
//     type: String, // PDF path or video link
//     required: false,
//     default: "General",
//   },
   
// }, { timestamps: true });

// export default mongoose.model("StudyMaterial", studyMaterialSchema);


