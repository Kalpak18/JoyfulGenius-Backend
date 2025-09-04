// controllers/otpController.js
import User from '../models/User.js';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../Utils/sendOtp.js';

// In-memory OTP request tracker
const otpRequestTracker = new Map();
const OTP_REQUEST_LIMIT = 5; // per hour
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;

function canRequestOtp(number) {
  const now = Date.now();
  if (!otpRequestTracker.has(number)) {
    otpRequestTracker.set(number, { count: 1, firstRequest: now });
    return true;
  }
  const data = otpRequestTracker.get(number);

  if (now - data.firstRequest > OTP_REQUEST_WINDOW_MS) {
    // Reset window
    otpRequestTracker.set(number, { count: 1, firstRequest: now });
    return true;
  }
  if (data.count >= OTP_REQUEST_LIMIT) return false;

  data.count++;
  otpRequestTracker.set(number, data);
  return true;
}

export const sendOtp = async (req, res) => {
  try {
    const { whatsappNumber } = req.body;

    if (!whatsappNumber || typeof whatsappNumber !== 'string') {
      return res.status(400).json({ error: 'Valid WhatsApp number is required' });
    }

    const formattedNumber = whatsappNumber.startsWith('+')
      ? whatsappNumber
      : `+91${whatsappNumber}`;

    if (!/^\+\d{10,15}$/.test(formattedNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    if (!canRequestOtp(formattedNumber)) {
      return res.status(429).json({ error: 'Too many OTP requests. Try again later.' });
    }

    await sendTwilioOtp(formattedNumber);
    res.status(200).json({ success: true, message: 'OTP sent successfully' });

  } catch (err) {
    console.error('OTP send failed:', err);
    res.status(500).json({ error: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { whatsappNumber, code } = req.body;

    if (!whatsappNumber || !code) {
      return res.status(400).json({ error: 'Number and OTP code are required' });
    }

    const formattedNumber = whatsappNumber.startsWith('+')
      ? whatsappNumber
      : `+91${whatsappNumber}`;

    const result = await verifyTwilioOtp(formattedNumber, code);
    console.log("Twilio Verify Result:", result);

    if (result.status === 'approved') {
      const rawNumber = whatsappNumber.replace(/^\+91/, '');

      const user = await User.findOneAndUpdate(
        { whatsappNo: rawNumber },
        { verified: true },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        user,
      });
    }

    res.status(400).json({ error: 'Invalid OTP' });

  } catch (err) {
    console.error('OTP verification failed:', err);
    res.status(500).json({ error: err.message });
  }
};
