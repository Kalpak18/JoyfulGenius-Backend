// models/Section.js
//
// A Section is a top-level grouping inside a v2 course.
// One level of nesting only — sections contain ContentBlocks, never other sections.

import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    courseId:  { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title:     { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 1000 },
    sortOrder: { type: Number, default: 0, index: true },

    // free  → block-by-default access is free for this section's blocks
    // paid  → must have paid the course to view blocks
    access: { type: String, enum: ["free", "paid"], default: "paid" },

    isPublished: { type: Boolean, default: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

sectionSchema.index({ courseId: 1, sortOrder: 1 });

export default mongoose.model("Section", sectionSchema);
