// models/StudyMaterial.js
// import mongoose from "mongoose";

// const studyMaterialSchema = new mongoose.Schema(
//   {
//     title: { type: String, required: true },
//     subject: { type: String, required: true },
//     type: { type: String, enum: ["pdf", "video"], required: true }, // pdf or video
//     url: { type: String, required: true },
//     uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("StudyMaterial", studyMaterialSchema);

// models/StudyMaterial.js

import mongoose from "mongoose";

const studyMaterialSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  type: {
    type: String, // "pdf" or "video"
    enum: ["pdf", "video"],
    required: true,
  },
  allowDownload: { type: Boolean, default: false },

  url: {
    type: String, // PDF path or video link
    required: true,
  },
  tags: {
  type: [String],
  required: false,
  default: []
},
  // tags:  {
  //   type: String, // PDF path or video link
  //   required: true,
  // },
  category:  {
    type: String, // PDF path or video link
    required: false,
    default: "General",
  },
}, { timestamps: true });

export default mongoose.model("StudyMaterial", studyMaterialSchema);


