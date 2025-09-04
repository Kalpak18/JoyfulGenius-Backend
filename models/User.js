// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const paidCourseSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  isPaid: { type: Boolean, default: false },
  username: { type: String, default: null },   // per-course username
  serial: { type: Number },                    // per-course serial

  // 🔑 composite keys (unique per course)
  serialKey: { type: String, unique: true, sparse: true },     // e.g. "<courseId>:<serial>"
  usernameKey: { type: String, unique: true, sparse: true },   // e.g. "<courseId>:<username>"

  progress: {
    completedLessons: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 }
  },
  testResults: [
    {
      testId: String,
      score: Number,
      attemptedAt: { type: Date, default: Date.now }
    }
  ],
  joinedAt: { type: Date, default: Date.now },
  paidAt: { type: Date }   // ✅ admin can see when user paid
});

const userSchema = new mongoose.Schema(
  {
    f_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true
    },
    whatsappNo: {
      type: String,
      required: true,
      unique: true,
      set: v => (v ? v.replace(/\D/g, "").slice(-10) : v)
    },
    district: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    verified: { type: Boolean, default: true },

    // Array of courses the user paid for
    paidCourses: { type: [paidCourseSchema], default: [] },

    // Array of courses the user is enrolled in (visited)
    enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],

    resetToken: String,
    resetTokenExpire: Date,
    otpLastSentAt: { type: Date },
    tokenVersion: { type: Number, default: 0, select: false }
  },
  { timestamps: true }
);

// ⚠️ removed: userSchema.index({ "paidCourses.serialKey"... }) — not valid inside array

// Pre-save hook: trim + hash password
userSchema.pre("save", async function (next) {
  Object.keys(userSchema.paths).forEach(path => {
    const field = userSchema.paths[path];
    if (
      field.options.trim &&
      typeof this[path] === "string" &&
      path !== "password"
    ) {
      this[path] = this[path].trim();
    }
  });

  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Password check
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user has paid for a course
userSchema.methods.hasPaidForCourse = function (courseId) {
  return this.paidCourses.some(
    pc => pc.courseId.toString() === courseId.toString() && pc.isPaid
  );
};

export default mongoose.model("User", userSchema);


// // models/User.js
// import mongoose from "mongoose";
// import bcrypt from "bcryptjs";

// const paidCourseSchema = new mongoose.Schema({
//   courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
//   isPaid: { type: Boolean, default: false },
//   username: { type: String, default: null },   // per-course username
//   serial: { type: Number },                    // per-course serial
//   progress: {
//     completedLessons: { type: Number, default: 0 },
//     totalLessons: { type: Number, default: 0 }
//   },
//   testResults: [
//     {
//       testId: String,
//       score: Number,
//       attemptedAt: { type: Date, default: Date.now }
//     }
//   ],
//   joinedAt: { type: Date, default: Date.now },
//   paidAt: { type: Date }   // ✅ restored, admin can see when user paid
// });

// const userSchema = new mongoose.Schema(
//   {
//     f_name: { type: String, required: true, trim: true },
//     last_name: { type: String, required: true, trim: true },
//     email: {
//       type: String,
//       lowercase: true,
//       trim: true,
//       unique: true,
//       sparse: true
//     },
//     whatsappNo: {
//       type: String,
//       required: true,
//       unique: true,
//       set: v => (v ? v.replace(/\D/g, "").slice(-10) : v)
//     },
//     district: { type: String, required: true, trim: true },
//     password: { type: String, required: true, select: false },
//     verified: { type: Boolean, default: true },

//     // Array of courses the user paid for
//     paidCourses: { type: [paidCourseSchema], default: [] },

//     // Array of courses the user is enrolled in (visited)
//     enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],

//     resetToken: String,
//     resetTokenExpire: Date,
//     otpLastSentAt: { type: Date },
//     tokenVersion: { type: Number, default: 0, select: false }
//   },
//   { timestamps: true }
// );

// // Pre-save hook: trim + hash password
// userSchema.pre("save", async function (next) {
//   Object.keys(userSchema.paths).forEach(path => {
//     const field = userSchema.paths[path];
//     if (
//       field.options.trim &&
//       typeof this[path] === "string" &&
//       path !== "password"
//     ) {
//       this[path] = this[path].trim();
//     }
//   });

//   if (this.isModified("password")) {
//     const salt = await bcrypt.genSalt(10);
//     this.password = await bcrypt.hash(this.password, salt);
//   }

//   next();
// });

// // Password check
// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// // Check if user has paid for a course
// userSchema.methods.hasPaidForCourse = function (courseId) {
//   return this.paidCourses.some(
//     pc => pc.courseId.toString() === courseId.toString() && pc.isPaid
//   );
// };

// export default mongoose.model("User", userSchema);
