import twilio from 'twilio';
import { env } from '../config/validateEnv.js';

const {TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN , TWILIO_PHONE, TWILIO_SERVICE_SID} = env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// For OTP only
export const sendOtp = async (phone, message = null) => {
  try {
    if (message) {
      // Send custom message (e.g., username)
      await client.messages.create({
        from: TWILIO_PHONE,
        to: phone,
        body: message,
      });
    } else {
      // Default OTP flow
      await client.verify.v2
        .services(TWILIO_SERVICE_SID)
        .verifications.create({ to: phone, channel: 'sms' });
    }
  } catch (error) {
    throw error;
  }
};

export const verifyOtp = async (phone, code) => {
  try {
    return await client.verify.v2
      .services(TWILIO_SERVICE_SID)
      .verificationChecks.create({ to: phone, code });
  } catch (error) {
    throw error;
  }
};
