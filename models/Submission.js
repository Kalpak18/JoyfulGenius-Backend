// models/Submission.js
//
// One student's answer to one assignment. Exactly one submission per
// (assignment, user). Students may re-submit (overwrites) unless the
// submission has been manually graded (status "overridden") or the
// assignment is closed.

import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    courseId:     { type: mongoose.Schema.Types.ObjectId, ref: "Course",     required: true, index: true },
    subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: "Subject",    default: null,  index: true },
    user:         { type: mongoose.Schema.Types.ObjectId, ref: "User",       required: true, index: true },

    answer:       { type: String, required: true, maxlength: 50000 },

    // Lifecycle:
    //   pending    — submitted, awaiting a human grader
    //   overridden — an admin/tutor has graded it
    // (Legacy values "graded" and "failed" are still accepted for older docs.)
    status: {
      type: String,
      enum: ["pending", "graded", "failed", "overridden"],
      default: "pending",
      index: true,
    },

    score:    { type: Number, default: null, min: 0 },
    feedback: { type: String, default: "", maxlength: 5000 },

    // Reviewer routing — computed at submit-time.
    // assignedReviewerId is the tutor with matching subject scope, if one exists.
    // If no scoped tutor is found the field stays null and all course admins/developers
    // can grade. See resolveAssignedReviewer() in controllers/assignmentController.js.
    assignedReviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true },

    // Manual override audit
    overriddenBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    overriddenAt:   { type: Date, default: null },
    overrideReason: { type: String, default: "", maxlength: 500 },

    submittedAt:    { type: Date, default: Date.now },
    gradedAt:       { type: Date, default: null },
  },
  { timestamps: true }
);

// One active submission per (assignment, user)
submissionSchema.index({ assignmentId: 1, user: 1 }, { unique: true });
submissionSchema.index({ user: 1, createdAt: -1 });
// Fast tutor inbox: "show me all pending submissions I own"
submissionSchema.index({ assignedReviewerId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Submission", submissionSchema);
