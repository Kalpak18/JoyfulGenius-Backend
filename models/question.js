import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
     subjectId: { type: mongoose.Schema.Types.ObjectId, 
      ref: "Subject", 
      required: true 
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: [true, "Chapter reference is required"],
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true, // optional, but useful for direct course filtering
    },
    question: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    options: {
      type: [String],
      validate: {
        validator: (arr) => arr.length === 4,
        message: "Exactly 4 options are required",
      },
      required: [true, "Options are required"],
    },
    correctAnswer: {
      type: Number,
      min: [0, "Correct answer index must be between 0 and 3"],
      max: [3, "Correct answer index must be between 0 and 3"],
      required: [true, "Correct answer index is required"],
    },
  },
  { timestamps: true }
);
questionSchema.index({ courseId: 1, subjectId: 1, chapterId: 1 });

export default mongoose.model("Question", questionSchema);
