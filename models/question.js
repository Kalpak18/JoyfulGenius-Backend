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
    // Optional image URL for the question (S3 / Cloudinary / any CDN)
    questionImage: { type: String, default: "" },

    options: {
      type: [String],
      validate: {
        validator: (arr) => arr.length === 4,
        message: "Exactly 4 options are required",
      },
      required: [true, "Options are required"],
    },
    // Optional image URL per option — parallel array, same length as options
    optionImages: {
      type: [String],
      default: () => ["", "", "", ""],
    },

    correctAnswer: {
      type: Number,
      min: [0, "Correct answer index must be between 0 and 3"],
      max: [3, "Correct answer index must be between 0 and 3"],
      required: [true, "Correct answer index is required"],
    },

    // Optional explanation shown to the student on the result/review screen
    // after they submit a test. Plain text; not exposed during the test itself.
    explanation: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);
questionSchema.index({ courseId: 1, subjectId: 1, chapterId: 1 });

export default mongoose.model("Question", questionSchema);
