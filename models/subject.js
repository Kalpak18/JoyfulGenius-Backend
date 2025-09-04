import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    }
  },
  { timestamps: true }
);

// Unique subject name within the same course
subjectSchema.index(
  { courseId: 1, name: 1 },
  { unique: true }
);

export default mongoose.models.Subject || mongoose.model("Subject", subjectSchema);
