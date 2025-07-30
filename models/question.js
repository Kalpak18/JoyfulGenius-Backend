import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true, validate: arr => arr.length === 4 },
  correctAnswer: { type: Number, required: true, min: 0, max: 3 }
});
export default mongoose.models.Question || mongoose.model('Question', questionSchema);


