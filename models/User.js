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
    f_name: { type: String, required: true },
    last_name: { type: String, required: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true // allows multiple null values
    },
    whatsappNo: { type: String, required: true, unique: true },
    district: { type: String, required: true },
    password: { type: String, required: true },
    verified: { type: Boolean, default: true },
    isPaid: { type: Boolean, default: false },
    username: { type: String },
    resetToken: String,
    resetTokenExpire: Date,
    otpLastSentAt: { type: Date }
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
