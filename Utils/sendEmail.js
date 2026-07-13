// Utils/sendEmail.js
//
// Provider-agnostic email sender.
// Set EMAIL_PROVIDER=smtp (default/Gmail), resend, or sendgrid in .env
// to switch without touching this file or any caller.
//
import nodemailer from 'nodemailer';
import { env } from '../config/validateEnv.js';

const { EMAIL_USER, EMAIL_PASS, EMAIL_PROVIDER, RESEND_API_KEY, SENDGRID_API_KEY } = env;

// ─── Transport factory ─────────────────────────────────────────────────────

function createTransport() {
  if (EMAIL_PROVIDER === "resend") {
    // Resend uses SMTP compatible interface with api key as password
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: RESEND_API_KEY },
    });
  }

  if (EMAIL_PROVIDER === "sendgrid") {
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 465,
      secure: true,
      auth: { user: "apikey", pass: SENDGRID_API_KEY },
    });
  }

  // Default: Gmail SMTP (good for dev; switch to Resend/SendGrid for production)
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

const transporter = createTransport();

const FROM_ADDRESS =
  EMAIL_PROVIDER === "resend" || EMAIL_PROVIDER === "sendgrid"
    ? `"Joyful Genius" <noreply@joyfulgenius.org>`
    : `"Joyful Genius" <${EMAIL_USER}>`;

/**
 * sendEmail(to, subject, text, html?)
 * Plain-text fallback always included; pass html for rich emails.
 */
const sendEmail = async (to, subject, text, html) => {
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
};

export default sendEmail;

// ─── HTML templates ────────────────────────────────────────────────────────

export const buildOtpEmail = (otp, name = '') => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;color:#1f2937;">
    <h2 style="color:#16a34a;margin:0 0 8px;">Verify your email</h2>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'}, use the code below to finish creating your Joyful Genius account:</p>
    <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 28px;font-size:30px;font-weight:800;letter-spacing:8px;color:#15803d;margin:8px 0 20px;">${otp}</div>
    <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong>. Don't share it with anyone.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">If you didn't request this, please ignore this email.</p>
  </div>`;

export const buildPaymentReceiptEmail = ({ name, courseName, amount, orderId, paymentId }) => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;color:#1f2937;">
    <h2 style="color:#16a34a;margin:0 0 8px;">Payment received</h2>
    <p style="font-size:15px;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="font-size:15px;line-height:1.6;">Thanks for enrolling in <strong>${courseName}</strong>. Your payment has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:6px 0;color:#6b7280;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:600;">₹${amount}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Order ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;">${orderId}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Payment ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;">${paymentId}</td></tr>
    </table>
    <p style="font-size:14px;color:#374151;">You can start the course immediately by signing in.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Need help? Reply to this email.</p>
  </div>`;

export const buildPasswordResetEmail = (resetUrl, name = '') => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;color:#1f2937;">
    <h2 style="color:#16a34a;margin:0 0 8px;">Reset your password</h2>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'}, click the button below to reset your Joyful Genius password:</p>
    <a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:8px 0 20px;">Reset Password</a>
    <p style="color:#6b7280;font-size:13px;margin:0;">This link expires in <strong>1 hour</strong>. If you didn't request this, ignore the email.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px;word-break:break-all;">Or copy: ${resetUrl}</p>
  </div>`;
