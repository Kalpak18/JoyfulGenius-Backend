import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  language: {
    type: String,
    trim: true
  },
  enrolledUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // -------------------- Username Features --------------------
  autoGenerateUsername: { type: Boolean, default: true },  // Auto-generate usernames for paid users
    customUsername: { type: Boolean, default: false },       // Admin-defined username format
    noUsername: { type: Boolean, default: false },           // No username generation
    usernameFormat: { type: String, default: "{serial}.{fname}{lname}.{district}" },
  // -------------------- Other fields if needed ----------------
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Optional: update updatedAt on save
courseSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("Course", courseSchema);
