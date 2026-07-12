// models/Payment.js
import mongoose from "mongoose";

/**
 * Payment — durable record of a Razorpay transaction.
 *
 * Lifecycle:
 *   1. POST /payments/order            → doc created with status "created"
 *   2. User completes Razorpay Checkout
 *   3. POST /payments/verify           → signature checked, status="paid",
 *                                        user marked paid for the course
 *   4. Webhook (parallel safety net)   → if 3 was missed, still flips to "paid"
 *
 * Idempotency: we look up by razorpayOrderId before mutating.
 */
const paymentSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },

    amountINR: { type: Number, required: true, min: 0 }, // rupees, NOT paise
    currency:  { type: String, default: "INR" },

    // Razorpay-specific fields. Optional because admin grants don't have an order.
    // NOTE: do NOT set `default: null` — a sparse unique index treats null as a
    // real value, which causes duplicate-key errors on the 2nd admin grant.
    // Leaving the field undefined is what actually makes sparse skip it.
    razorpayOrderId:   { type: String, unique: true, sparse: true, index: true },
    razorpayPaymentId: { type: String, sparse: true,  index: true },
    razorpaySignature: { type: String },

    // Source of truth for *how* this access was granted.
    //   razorpay  → real customer payment
    //   admin_grant → comp'd by admin (free trial, support case, etc.)
    source: {
      type:    String,
      enum:    ["razorpay", "admin_grant"],
      default: "razorpay",
      index:   true,
    },

    status: {
      type:    String,
      // granted/revoked are admin-grant lifecycle states; paid/refunded are Razorpay.
      enum:    ["created", "paid", "failed", "refunded", "granted", "revoked"],
      default: "created",
      index:   true,
    },

    // Admin audit fields — required when source === "admin_grant".
    grantedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    grantedReason: { type: String, default: "", maxlength: 500 },
    revokedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    revokedReason: { type: String, default: "", maxlength: 500 },
    revokedAt:     { type: Date,   default: null },

    // Last Razorpay webhook payload received (for forensic + replay protection)
    lastWebhookEvent: { type: String, default: null },
    lastWebhookAt:    { type: Date,   default: null },

    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, courseId: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
