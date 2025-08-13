// controllers/usercontroller.js
import User from '../models/User.js';
import crypto from 'crypto';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../Utils/sendOtp.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import sendEmail from '../Utils/sendEmail.js'; // helper to send email

// export const forgotPasswordMobile = async (req, res) => {
//   const { whatsappNo } = req.body;

//   if (!whatsappNo ) {
//     return res.status(400).json({ message: 'WhatsApp number is required' });
//   }

//   const rawNumber = whatsappNo .replace(/^\+91/, '');
//   const user = await User.findOne({ whatsappNo: rawNumber });

//   if (!user) return res.status(404).json({ message: 'User not found' });

//   const formatted = whatsappNo .startsWith('+91') ? whatsappNo : `+91${whatsappNo }`;
//   try {
//     await sendTwilioOtp(formatted);
//     res.status(200).json({ message: 'OTP sent successfully' });
//   } catch (err) {
//     console.error("OTP send error:", err);
//     res.status(500).json({ message: 'Failed to send OTP' });
//   }
// };

export const forgotPasswordMobile = async (req, res) => {
  try {
    const whatsappNo = req.body;

    if (!whatsappNo ) {
      return res.status(400).json({ message: 'WhatsApp number is required.' });
    }

    // Format number for Twilio
    const formattedNumber = whatsappNo .startsWith('+91')
      ? whatsappNo 
      : `+91${whatsappNo }`;

    // ✅ Find existing user
    const user = await User.findOne({ whatsappNo : formattedNumber });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this number.' });
    }

    // ✅ Cooldown check (5 min)
    const MIN_OTP_INTERVAL = 5 * 60 * 1000;
    if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < MIN_OTP_INTERVAL) {
      return res.status(429).json({
        message: 'OTP already sent recently. Please wait before requesting again.',
      });
    }

    // ✅ Send OTP
    await sendTwilioOtp(formattedNumber);

    // ✅ Update last sent time
    user.otpLastSentAt = new Date();
    await user.save();

    res.status(200).json({ message: 'OTP sent successfully to your mobile.' });
  } catch (error) {
    console.error('Forgot Password Mobile Error:', error.message);
    res.status(500).json({ message: 'Server Error. Could not send OTP.' });
  }
};



export const verifyResetOtp = async (req, res) => {
  const { whatsappNo , code } = req.body;

  const formatted = whatsappNo .startsWith('+91') ? whatsappNo : `+91${whatsappNo }`;
  const result = await verifyTwilioOtp(formatted, code);

  if (result.status !== 'approved') {
    return res.status(400).json({ message: 'Invalid OTP' });
  }

  const rawNumber = whatsappNo .replace(/^\+91/, '');
  const user = await User.findOne({ whatsappNo: rawNumber });

  if (!user) return res.status(404).json({ message: 'User not found' });

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpire = Date.now() + 3600000; // 1 hour
  await user.save();

  return res.status(200).json({ message: "OTP verified", resetToken: token });
};


// Forgot Password Controller
// export const forgotPassword = async (req, res) => {
//   const { email } = req.body;

//   if (!email) return res.status(400).json({ message: 'Email is required' });

//   const user = await User.findOne({ email });
//   if (!user) return res.status(404).json({ message: 'User not found' });

//   const token = crypto.randomBytes(32).toString('hex');
//   user.resetToken = token;
//   user.resetTokenExpire = Date.now() + 3600000; // 1 hour
//   await user.save();

//   const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
//   const message = `Reset your password by clicking here: ${resetUrl}`;

//   try {
//     await sendEmail(user.email, 'Password Reset', message);
//     res.status(200).json({ message: 'Password reset link sent to email' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Failed to send email' });
//   }
// };

// Reset Password

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpire = Date.now() + 3600000; // 1 hour
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  const message = `Reset your password by clicking here: ${resetUrl}`;

  try {
    await sendEmail(user.email, 'Password Reset', message);
    res.status(200).json({ message: 'Password reset link sent to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send email' });
  }
};


export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpire: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  user.password = password;
  user.resetToken = undefined;
  user.resetTokenExpire = undefined;
  await user.save();

  res.status(200).json({ message: 'Password reset successful' });
};

// export const registerUser = async (req, res) => {
//   const { whatsappNo } = req.body;

//   try {
//     if (!whatsappNo) {
//       return res.status(400).json({ message: 'Mobile number is required' });
//     }

//     const cleanMobile = whatsappNo.replace(/^\+91/, '');
//     const formattedNumber = whatsappNo.startsWith('+91') ? whatsappNo : `+91${whatsappNo}`;

//     // const existingUsers = await User.countDocuments({ whatsappNo: cleanMobile });
//     // if (existingUsers >= 3) {
//     //   return res.status(400).json({ message: 'Only 3 accounts allowed per mobile number' });
//     // }

//     const existing = await User.findOne({ whatsappNo: cleanMobile });
// if (existing) {
//   return res.status(400).json({ message: 'This mobile number is already registered' });
// }


//     await sendTwilioOtp(formattedNumber);
//     res.status(200).json({ message: 'OTP sent successfully', whatsappNo: cleanMobile });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// export const registerUser = async (req, res) => {
//   try {
//     const whatsappNo = req.body.whatsappNo || req.body.mobile;

//     if (!whatsappNo ) {
//       return res.status(400).json({ message: 'WhatsApp number is required.' });
//     }

//     // Format number for Twilio (+91 prefix if missing)
//     const formattedNumber = whatsappNo .startsWith('+91')
//       ? whatsappNo 
//       : `+91${whatsappNo }`;

//     // ✅ Check if already registered
//     const existingUser = await User.findOne({ whatsappNo : formattedNumber });
//     if (existingUser) {
//       return res.status(400).json({ message: 'Number already registered.' });
//     }

//     // ✅ Cooldown check (5 minutes)
//     const MIN_OTP_INTERVAL = 5 * 60 * 1000;
//     if (existingUser?.otpLastSentAt && Date.now() - existingUser.otpLastSentAt.getTime() < MIN_OTP_INTERVAL) {
//       return res.status(429).json({ message: 'OTP already sent recently. Please wait before requesting again.' });
//     }

//     // ✅ Create new user entry with number
//     const newUser = new User({ whatsappNo : formattedNumber });

//     // ✅ Send OTP
//     await sendTwilioOtp(formattedNumber);

//     // ✅ Save OTP send time
//     newUser.otpLastSentAt = new Date();
//     await newUser.save();

//     res.status(201).json({ message: 'OTP sent successfully to your mobile.' });
//   } catch (error) {
//     console.error('Register Error:', error.message);
//     res.status(500).json({ message: 'Server Error. Could not send OTP.' });
//   }
// };

// REGISTER USER (No OTP for now)

export const registerUser = async (req, res) => {
  try {
    let { f_name, last_name, email, whatsappNo, district, password } = req.body;

    // Trim all string inputs
    f_name = f_name?.trim();
    last_name = last_name?.trim();
    email = email?.trim();
    whatsappNo = whatsappNo?.trim();
    district = district?.trim();

    if (!f_name || !last_name || !whatsappNo || !district || !password) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }
    whatsappNo = whatsappNo.replace(/\D/g, "");


    if (whatsappNo.startsWith("91") && whatsappNo.length > 10) {
  whatsappNo = whatsappNo.slice(-10); // keep only last 10 digits
}

   const whatsappRegex = /^[0-9]{10}$/;
if (!whatsappRegex.test(whatsappNo)) {
  return res.status(400).json({ message: "WhatsApp number must be exactly 10 digits" });
}

     if (email && email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    // Check unique WhatsApp
    const existingUser = await User.findOne({ whatsappNo });
    if (existingUser) {
      return res.status(400).json({ message: "WhatsApp number already registered" });
    }

    // Check unique email (only if provided)
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    // Directly create user
    const user = await User.create({
      f_name,
      last_name,
      email: email && email.trim() !== "" ? email : undefined,
      // email: email || undefined,
      whatsappNo,
      district,
      password
    });

    // Return created user (without password)
    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(201).json({
      message: "User registered successfully",
      user: safeUser
    });

  } catch (error) {
    console.error("Registration error:", error);

    // Friendly duplicate key error handling
    if (error.code === 11000 && error.keyValue) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already registered`
      });
    }

    res.status(500).json({ message: "Server error" });
  }
};




export const verifyUserOtp = async (req, res) => {
  const { whatsappNo , code, user } = req.body;

  try {
    const formatted = whatsappNo .startsWith('+91') ? whatsappNo : `+91${whatsappNo }`;
    const result = await verifyTwilioOtp(formatted, code);

    console.log("🛡️ Twilio Verify Result:", result);

    if (result.status === 'approved') {
      // Remove +91 for storage
      const rawNumber = whatsappNo .replace(/^\+91/, '');

      // Create new user — password will be hashed by Mongoose schema
      const newUser = new User({
        f_name: user.f_name,
        last_name: user.last_name || '',
        whatsappNo: rawNumber,
        email: user.email || undefined,
        password: user.password, // Will be hashed by pre-save hook
        district: user.district,
        verified: true,
      });

      await newUser.save();

      const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
        expiresIn: '100d',
      });

      res.status(201).json({
        success: true,
        message: 'User registered & OTP verified',
         user: {
          ...newUser._doc,
          name: `${newUser.f_name} ${newUser.last_name}`.trim()
        },
        token,
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (error) {
    console.error("OTP verify error:", error);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};


// export const loginUser = async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     console.log("🛠️ Login attempt for:", email);
//     const user = await User.findOne({ email });

//     if (!user) {
//       console.log("❌ No user found");
//       return res.status(400).json({ message: 'User not found' });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     // console.log("✅ Password match:", isMatch);

//     if (!isMatch) {
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//       expiresIn: '7d',
//     });

//     return res.status(200).json({
//   message: 'Login successful',
//   token,
//   user: {
//     name: `${user.f_name} ${user.last_name}` .trim(),
//     email: user.email,
//     isPaid: user.isPaid, // ✅ important
//     username: user.username,
//   },
// });

//   } catch (error) {
//     console.error('❌ Login error:', error);
//     return res.status(500).json({ message: 'Server error during login' });
//   }
// };

export const loginUser = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const users = await User.find({
      $or: [{ email: identifier }, { whatsappNo: identifier }]
    });

    if (!users || users.length === 0) {
      console.log("❌ No user found");
      return res.status(400).json({ message: 'User not found' });
    }

    // Compare password against each matched user
    let matchedUser = null;
    for (const user of users) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: matchedUser._id }, process.env.JWT_SECRET, {
      expiresIn: '100d',
    });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        name: `${matchedUser.f_name} ${matchedUser.last_name}`.trim(),
        whatsappNo: matchedUser.whatsappNo,
        email: matchedUser.email,
        isPaid: matchedUser.isPaid,
        username: matchedUser.username,
      },
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

export const markPaid = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isPaid = true;

    if (!user.username) {
      const paidCount = await User.countDocuments({ isPaid: true });
      const serialNumber = paidCount + 1;
      const formattedFirstName = user.f_name.toLowerCase().replace(/\s+/g, '');
      const formattedLastName = user.last_name.toLowerCase().replace(/\s+/g, '');
      const formattedDistrict = user.district.toLowerCase().replace(/\s+/g, '');
      user.username = `${serialNumber}.${formattedFirstName}${formattedLastName}.${formattedDistrict}`;
    }

    user.markModified('isPaid');
    user.markModified('username');
    await user.save();

    res.status(200).json({ message: "Payment confirmed", username: user.username, 
      user: {
        ...user._doc,
        name: `${user.f_name} ${user.last_name}`.trim()
      }
    });
  } catch (err) {
    console.error("❌ Mark Paid failed:", err); // log full error
    res.status(500).json({ error: err.message });
  }
};

// export const togglePaidStatus = async (req, res) => {
//   const { userId } = req.params;

//   try {
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Toggle isPaid
//     user.isPaid = !user.isPaid;

//     // If marking as paid and no username, generate one
//     if (user.isPaid && !user.username) {
//       const paidCount = await User.countDocuments({ isPaid: true });
//       const serialNumber = paidCount + 1;
//       const formattedName = user.f_name.toLowerCase().replace(/\s+/g, '');
//       const formattedTaluka = user.taluka.toLowerCase().replace(/\s+/g, '');

//       user.username = `${serialNumber}.${formattedName}.${formattedTaluka}`;
//     }
//     if (!user.isPaid) {
//       user.username = undefined;
//     }
//     await user.save();

//     res.status(200).json({
//       message: `User marked as ${user.isPaid ? 'Paid' : 'Unpaid'}`,
//       isPaid: user.isPaid,
//       username: user.username || null,
//       user: {
//         ...user._doc,
//         name: `${user.f_name} ${user.last_name}`.trim()
//       }
//     });
//   } catch (error) {
//     console.error("Toggle Paid Status Error:", error);
//     res.status(500).json({ message: "Server error while toggling paid status" });
//   }
// };


export const togglePaidStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Toggle the paid status
    user.isPaid = !user.isPaid;

    // Generate username if being marked as paid
    if (user.isPaid && !user.username) {
      const paidCount = await User.countDocuments({ isPaid: true });
      const serialNumber = paidCount + 1 ;
      const formattedFirstName = user.f_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const formattedLastName = user.last_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const formattedDistrict = user.district.toLowerCase().replace(/[^a-z0-9]/g, '');
      user.username = `${serialNumber}.${formattedFirstName}${formattedLastName}.${formattedDistrict}`;
    }

    // Clear username if being marked as unpaid
    if (!user.isPaid && user.username) {
      user.username = undefined;
    }

    await user.save();

    res.status(200).json({
      success: true,
      isPaid: user.isPaid,
      username: user.username || null,
      message: `User marked as ${user.isPaid ? 'Paid' : 'Unpaid'}`
    });

  } catch (error) {
    console.error("Toggle Paid Status Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error while toggling paid status",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
     res.status(200).json({
      ...user._doc,
      name: `${user.f_name} ${user.last_name}`.trim()
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update Email
export const updateEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.email = email;
    await user.save();

    res.status(200).json({ message: "Email updated successfully" });
  } catch (err) {
    console.error("❌ Email update error:", err);
    res.status(500).json({ message: "Server error while updating email" });
  }
};

// ✅ Delete Account
export const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.status(200).json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Delete account error:", err);
    res.status(500).json({ message: "Server error while deleting account" });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("isPaid");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ isPaid: user.isPaid });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
