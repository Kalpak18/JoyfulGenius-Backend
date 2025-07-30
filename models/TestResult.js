// Backend/models/TestResult.js
 import mongoose from 'mongoose';

// const testResultSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   subject: { type: String, required: true },
//   chapter: { type: String, required: true },
//   score: { type: Number, required: true },
//   total: { type: Number, required: true },
//   submittedAt: { type: Date, default: Date.now },
// });

// export default mongoose.model('TestResult', testResultSchema);
// const testResultSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   subject: { type: String },
//   chapter: { type: String },
//   testName: { type: String }, // For manual entries
//   total: { type: Number, required: true },
//   score: { type: Number, required: true },
//   isManual: { type: Boolean, default: false },
//   submittedAt: { type: Date, default: Date.now },
// });

// export default mongoose.model("TestResult", testResultSchema);

// models/TestResult.js
const testResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subject: String,
  chapter: String,
  score: Number,
  total: Number,
  type: { type: String, default: "chapter" }, // new field for manual/mock
  details: [
    {
      question: String,
      options: [String],
      correctAnswer: Number,
      userAnswer: Number,
      isCorrect: Boolean,
    },
  ],
}, { timestamps: true });

export default mongoose.model("TestResult", testResultSchema);