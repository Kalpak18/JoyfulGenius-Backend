// models/Admin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// A tutor's scope entry: one course, plus the specific subjects inside that
// course they own. Empty subjectIds means "all subjects in this course".
const subjectScopeSchema = new mongoose.Schema(
  {
    courseId:   { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
  },
  { _id: false }
);

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    // developer = top-level (you) — can do anything, including managing admins/tutors
    // admin     = staff you create — can manage all content but not other admin accounts
    // tutor     = scoped staff — can only edit content tied to scopedCourseIds / subjectScopes
    role: { type: String, enum: ["admin", "developer", "tutor"], default: "admin", index: true },
    name: { type: String, trim: true, default: "" },

    // Only meaningful when role === "tutor". Empty means no access to anything.
    // Enforced server-side by middleware/tutorScope.js — never trust the client.
    scopedCourseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],

    // Per-course-per-subject scoping. When populated, this narrows the tutor's
    // reach inside a course to specific subjects — used to route subjective-answer
    // submissions to the right grader. If empty for a course the tutor still
    // owns the whole course (falls back to scopedCourseIds).
    subjectScopes: { type: [subjectScopeSchema], default: [] },

    tokenVersion: { type: Number, default: 0 },
    passwordResetToken:   { type: String, default: null },
    passwordResetExpires: { type: Date,   default: null },
  },
  { timestamps: true }
);

adminSchema.index({ passwordResetToken: 1 }, { sparse: true });
// For routing student submissions to a tutor by (courseId, subjectId)
adminSchema.index({ role: 1, "subjectScopes.courseId": 1, "subjectScopes.subjectIds": 1 });

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
