import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// For OTP only
export const sendOtp = async (phone, message = null) => {
  try {
    if (message) {
      // Send custom message (e.g., username)
      await client.messages.create({
        from: process.env.TWILIO_PHONE,
        to: phone,
        body: message,
      });
    } else {
      // Default OTP flow
      await client.verify.v2
        .services(process.env.TWILIO_SERVICE_SID)
        .verifications.create({ to: phone, channel: 'sms' });
    }
  } catch (error) {
    throw error;
  }
};

export const verifyOtp = async (phone, code) => {
  try {
    return await client.verify.v2
      .services(process.env.TWILIO_SERVICE_SID)
      .verificationChecks.create({ to: phone, code });
  } catch (error) {
    throw error;
  }
};
