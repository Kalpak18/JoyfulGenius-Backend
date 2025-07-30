// models/TestAttempt.js
import mongoose from 'mongoose';

// const testAttemptSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   subject: { type: String, required: true },
//   chapter: { type: String, required: true },
//   questions: [
//     {
//       question: String,
//       options: [String],
//       selectedAnswer: Number,
//       correctAnswer: Number
//     }
//   ],
//   score: { type: Number, required: true },
//   total: { type: Number, required: true },
//   attemptedAt: { type: Date, default: Date.now }
// });

// export default mongoose.model('TestAttempt', testAttemptSchema);

const testAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  questions: [
    {
      question: String,
      options: [String],
      selectedAnswer: Number,
      correctAnswer: Number
    }
  ],
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  attemptedAt: { type: Date, default: Date.now }
});
export default mongoose.model('TestAttempt', testAttemptSchema);