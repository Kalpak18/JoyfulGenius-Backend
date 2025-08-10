// import mongoose from 'mongoose';
// import bcrypt from 'bcryptjs';

// const userSchema = new mongoose.Schema(
//   {
//     f_name: { type: String, required: true },
//     last_name:{ type: String, required: true },
//     email: {  type: String,
//     lowercase: true,
//     trim: true,
//     unique: true,
//     sparse: true, },
//     whatsappNo: { type: String, required: true, unique: true },
//     // taluka: { type: String, required: true },
//     district: { type: String, required: true },
//     password: { type: String, required: true },
//     verified: { type: Boolean, default: false },
//     isPaid: { type: Boolean, default: false },
//     username: { type: String }, // ✅ this was missing
//     resetToken: String,
//     resetTokenExpire: Date,
//     otpLastSentAt: { type: Date }
//   },
//   { timestamps: true }
// );

// // Hash password before saving
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
// });

// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// export default mongoose.model('User', userSchema);


import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    f_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true // allows multiple null values
    },
    whatsappNo: {
      type: String,
      required: true,
      unique: true,
      set: v => v?.trim()
    },
    district: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    verified: { type: Boolean, default: true },
    isPaid: { type: Boolean, default: false },
    username: { type: String, trim: true },
    resetToken: String,
    resetTokenExpire: Date,
    otpLastSentAt: { type: Date }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Trim only safe string fields (avoid trimming hashed password)
  for (let key in this._doc) {
    if (typeof this[key] === "string" && key !== "password") {
      this[key] = this[key].trim();
    }
  }

  // Hash password only if modified
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
