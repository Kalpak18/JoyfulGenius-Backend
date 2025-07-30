import User from '../models/User.js';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../Utils/sendOtp.js';

export const sendOtp = async (req, res) => {
  const { whatsappNumber } = req.body;

  if (!whatsappNumber) {
    return res.status(400).json({ error: 'WhatsApp number is required' });
  }

  try {
    const formatted = whatsappNumber.startsWith('+91') ? whatsappNumber : `+91${whatsappNumber}`;
    await sendTwilioOtp(formatted);
    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error('OTP send failed:', err);
    res.status(500).json({ error: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  const { whatsappNumber, code } = req.body;

  try {
    const formatted = whatsappNumber.startsWith('+91') ? whatsappNumber : `+91${whatsappNumber}`;
    const result = await verifyTwilioOtp(formatted, code);

    console.log("Twilio Verify Result:", result);

    if (result.status === 'approved') {
      const rawNumber = whatsappNumber.replace(/^\+91/, '');

      const user = await User.findOneAndUpdate(
        { whatsappNo: rawNumber },
        { verified: true },
        { new: true }
      );

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        user,
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (err) {
    console.error('OTP verification failed:', err);
    res.status(500).json({ error: err.message });
  }
};
