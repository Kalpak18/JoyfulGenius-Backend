import mongoose from "mongoose";

const chapterSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  title: { type: String, required: true },
  language: { type: String, required: true },
  youtubeCode: { type: String, default: "" },
  freetestCode: { type: String, default: "" },
  mastertestCode: { type: String, default: "" },
}, {
  timestamps: true,
});

const Chapter = mongoose.model("Chapter", chapterSchema);

export default Chapter;
