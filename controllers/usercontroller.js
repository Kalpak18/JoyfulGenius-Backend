// controllers/usercontroller.js
import User from '../models/User.js';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../Utils/sendOtp.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const registerUser = async (req, res) => {
  const { whatsappNo } = req.body;

  try {
    if (!whatsappNo) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    const cleanMobile = whatsappNo.replace(/^\+91/, '');
    const formattedNumber = whatsappNo.startsWith('+91') ? whatsappNo : `+91${whatsappNo}`;

    const existingUsers = await User.countDocuments({ whatsappNo: cleanMobile });
    if (existingUsers >= 3) {
      return res.status(400).json({ message: 'Only 3 accounts allowed per mobile number' });
    }

    await sendTwilioOtp(formattedNumber);
    res.status(200).json({ message: 'OTP sent successfully', whatsappNo: cleanMobile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyUserOtp = async (req, res) => {
  const { whatsappNumber, code, user } = req.body;

  try {
    const formatted = whatsappNumber.startsWith('+91') ? whatsappNumber : `+91${whatsappNumber}`;
    const result = await verifyTwilioOtp(formatted, code);

    console.log("🛡️ Twilio Verify Result:", result);

    if (result.status === 'approved') {
      // Remove +91 for storage
      const rawNumber = whatsappNumber.replace(/^\+91/, '');

      // Create new user — password will be hashed by Mongoose schema
      const newUser = new User({
        ...user,
        whatsappNo: rawNumber,
        verified: true,
      });

      await newUser.save();

      const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });

      res.status(201).json({
        success: true,
        message: 'User registered & OTP verified',
        user: newUser,
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

// export const verifyUserOtp = async (req, res) => {
//   const { code, user } = req.body;

//   if (!code || !user || !user.whatsappNo) {
//     return res.status(400).json({ message: "Missing required fields" });
//   }

//   try {
//     const formatted = user.whatsappNo.startsWith('+91') ? user.whatsappNo : `+91${user.whatsappNo}`;
//     const result = await verifyTwilioOtp(formatted, code);

//     console.log("Twilio Verify Result:", result);

//     if (result.status !== 'approved') {
//       return res.status(400).json({ message: 'Invalid OTP' });
//     }

//     // Check if already 3 users registered with this number
//     const count = await User.countDocuments({ whatsappNo: user.whatsappNo });
//     if (count >= 3) {
//       return res.status(400).json({ message: 'Only 3 accounts allowed per mobile number' });
//     }

//     // Hash the password before saving
//     const hashedPassword = await bcrypt.hash(user.password, 10);

//     const newUser = new User({
//       ...user,
//       password: hashedPassword,
//       verified: true,
//     });

//     await newUser.save();

//     const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
//       expiresIn: '7d',
//     });

//     res.status(201).json({
//       success: true,
//       message: 'User registered & OTP verified',
//       user: newUser,
//       token,
//     });
//   } catch (error) {
//     console.error("OTP verify error:", error);
//     res.status(500).json({ message: 'Server error during OTP verification' });
//   }
// };
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("🛠️ Login attempt for:", email);
    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ No user found");
      return res.status(400).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    // console.log("✅ Password match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(200).json({
  message: 'Login successful',
  token,
  user: {
    name: user.name,
    email: user.email,
    isPaid: user.isPaid, // ✅ important
    username: user.username,
  },
});

  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// export const loginUser = async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     const user = await User.findOne({ email });
//     if (!user) return res.status(400).json({ message: 'User not found' });

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

//     const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//       expiresIn: '7d',
//     });

//     res.status(200).json({ message: 'Login successful', token, user });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({ message: 'Server error during login' });
//   }
// };

export const markPaid = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isPaid = true;

    if (!user.username) {
      const paidCount = await User.countDocuments({ isPaid: true });
      const serialNumber = paidCount + 1;
      const formattedName = user.name.toLowerCase().replace(/\s+/g, '');
      const formattedTaluka = user.taluka.toLowerCase().replace(/\s+/g, '');
      user.username = `${serialNumber}.${formattedName}.${formattedTaluka}`;
    }

    user.markModified('isPaid');
    user.markModified('username');
    await user.save();

    res.status(200).json({ message: "Payment confirmed", username: user.username });
  } catch (err) {
    console.error("❌ Mark Paid failed:", err); // log full error
    res.status(500).json({ error: err.message });
  }
};

export const togglePaidStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Toggle isPaid
    user.isPaid = !user.isPaid;

    // If marking as paid and no username, generate one
    if (user.isPaid && !user.username) {
      const paidCount = await User.countDocuments({ isPaid: true });
      const serialNumber = paidCount + 1;
      const formattedName = user.name.toLowerCase().replace(/\s+/g, '');
      const formattedTaluka = user.taluka.toLowerCase().replace(/\s+/g, '');

      user.username = `${serialNumber}.${formattedName}.${formattedTaluka}`;
    }
    if (!user.isPaid) {
      user.username = undefined;
    }
    await user.save();

    res.status(200).json({
      message: `User marked as ${user.isPaid ? 'Paid' : 'Unpaid'}`,
      isPaid: user.isPaid,
      username: user.username || null,
    });
  } catch (error) {
    console.error("Toggle Paid Status Error:", error);
    res.status(500).json({ message: "Server error while toggling paid status" });
  }
};


export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};