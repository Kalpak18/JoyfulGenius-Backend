import nodemailer from 'nodemailer';
import { env } from '../config/validateEnv.js';

const {EMAIL_USER , EMAIL_PASS} = env;

const sendEmail = async (to, subject, text) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // ✅ use Gmail service
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Joyful Genius" <${EMAIL_USER}>`,
    to,
    subject,
    text,
  });
};

export default sendEmail;
