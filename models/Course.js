// models/Course.js
import mongoose from "mongoose";

// Slugify a course name: lowercase, alphanumeric + dashes, no leading/trailing dashes.
// "Class 7 — NMMS Prep!" → "class-7-nmms-prep"
export const slugify = (name = "") =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const courseSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    // SEO-friendly URL handle. Derived from name when not provided.
    slug:        { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    description: { type: String, trim: true, default: "" },
    language:    { type: String, trim: true, default: "" },

    // Hero / thumbnail shown on student-facing course cards (S3 URL).
    thumbnailUrl: { type: String, default: "" },

    enrolledUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // -------------------- Pricing --------------------
    // priceINR         → MRP / original price shown struck-through on the card
    // discountINR      → fixed amount knocked off (₹). Takes precedence over %.
    // discountPercent  → % off (0-100). Used only if discountINR is 0.
    // The payable price is derived on the frontend via calcPricing() in
    // styles/theme.js — never stored, so the admin only edits one source.
    priceINR:        { type: Number, default: 149, min: 0 },
    discountINR:     { type: Number, default: 0,   min: 0 },
    discountPercent: { type: Number, default: 0,   min: 0, max: 100 },

    // -------------------- Publishing --------------------
    // draft  → admin-only, students don't see it
    // published → live, students can enroll
    // archived → hidden from new students; existing paid students keep access
    status: {
      type:    String,
      enum:    ["draft", "published", "archived"],
      default: "draft",
      index:   true,
    },

    // How long after purchase does this course stay accessible? null = forever.
    validityDays: { type: Number, default: null, min: 1 },

    // Who created/last-edited this course (for audit).
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

    // -------------------- Course Type --------------------
    // standard    → video lectures + chapter tests (existing behavior, default)
    // test_series → question paper bundles only; uses TestBundle model
    courseType: {
      type:    String,
      enum:    ["standard", "test_series"],
      default: "standard",
    },

    // -------------------- Video Player Toggle --------------------
    // Controls whether the "Start Learning" CTA + video player shows for
    // students. Set false for test-only courses (like NMMS which uses
    // external Testmoz tests per chapter and has no video lectures).
    // Chapters and their test links still render either way.
    hasPlayer: {
      type:    Boolean,
      default: true,
    },

    // -------------------- Builder version --------------------
    // v1 → legacy: Course → Subject → Chapter → Lecture
    // v2 → flexible: Course → Section → ContentBlock[]
    // Opt-in per course. Existing courses stay v1; create-new flow defaults to v2.
    builderVersion: {
      type:    String,
      enum:    ["v1", "v2"],
      default: "v1",
      index:   true,
    },

  },
  { timestamps: true }
);

courseSchema.index({ status: 1, createdAt: -1 });

// Auto-fill slug from name if not provided
courseSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
  next();
});

export default mongoose.model("Course", courseSchema);
