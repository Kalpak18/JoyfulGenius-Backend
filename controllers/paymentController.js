// controllers/paymentController.js
//
// Razorpay integration:
//   POST /api/payments/order   — auth'd user creates an order
//   POST /api/payments/verify  — client confirms after Checkout.success
//   POST /api/payments/webhook — Razorpay calls us; we verify and reconcile
//
// We DO NOT trust the client to tell us a payment succeeded — every "paid"
// transition is validated by either signature check (verify) or webhook.

import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Course  from "../models/Course.js";
import User    from "../models/User.js";
import sendEmail, { buildPaymentReceiptEmail } from "../Utils/sendEmail.js";
import { env } from "../config/validateEnv.js";

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env;

// Lazy-init so a missing key doesn't crash boot — endpoints check this themselves
let razorpayClient = null;
const getRazorpay = () => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;
  if (!razorpayClient) {
    razorpayClient = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return razorpayClient;
};

/* ===========================
   Helper — mark user paid for a course

   Atomic to handle the /verify + webhook race: if both fire near-simultaneously,
   each call goes through MongoDB atomically so we never insert two paidCourses
   entries for the same course. Strategy:
     1. Try to flip an existing unpaid entry to paid (single doc update).
     2. If no such entry existed, push a new one — but only if no entry for
        this course exists at all (guarded by $not + $elemMatch).
     3. If both 1 and 2 matched zero docs, the user already has a paid entry.
=========================== */
async function markUserPaidForCourse({ userId, courseId }) {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");
  const now = new Date();

  // Step 1: flip existing unpaid entry → paid
  const flipped = await User.findOneAndUpdate(
    { _id: userId, paidCourses: { $elemMatch: { courseId, isPaid: false } } },
    { $set: { "paidCourses.$.isPaid": true, "paidCourses.$.paidAt": now } },
    { new: true }
  );
  if (flipped) return { user: flipped, course, alreadyPaid: false };

  // Step 2: push new entry only if no entry for this course exists
  const pushed = await User.findOneAndUpdate(
    { _id: userId, paidCourses: { $not: { $elemMatch: { courseId } } } },
    { $push: { paidCourses: { courseId, isPaid: true, paidAt: now, joinedAt: now } } },
    { new: true }
  );
  if (pushed) return { user: pushed, course, alreadyPaid: false };

  // Neither matched → an entry exists already and is already paid (or user vanished)
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  return { user, course, alreadyPaid: true };
}

/* ===========================
   POST /api/payments/order
   Body: { courseId }
   Auth: protect (Bearer token)
=========================== */
export const createOrder = async (req, res) => {
  try {
    const rp = getRazorpay();
    if (!rp) {
      return res.status(503).json({ message: "Payments are not configured on the server." });
    }

    const userId = req.user?.id;
    const { courseId } = req.body || {};
    if (!userId)   return res.status(401).json({ message: "Not authenticated" });
    if (!courseId) return res.status(400).json({ message: "courseId is required" });
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId)
      .select("name priceINR discountINR discountPercent")
      .lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Server-side price calculation — the client is never trusted for money.
    // Rules mirror the frontend calcPricing() helper:
    //   priceINR         → MRP (before discount)
    //   discountINR > 0  → subtract this fixed amount (takes precedence)
    //   discountPercent  → else subtract this % of priceINR
    // Payable is clamped to [0, priceINR].
    const mrp        = Number(course.priceINR) || 0;
    const dINR       = Number(course.discountINR)     || 0;
    const dPct       = Math.max(0, Math.min(100, Number(course.discountPercent) || 0));
    const discount   = dINR > 0 ? Math.min(dINR, mrp) : Math.round((mrp * dPct) / 100);
    const amountINR  = Math.max(0, mrp - discount);

    if (!Number.isFinite(amountINR) || amountINR <= 0) {
      return res.status(400).json({ message: "This course is free or unpriced — no payment needed." });
    }

    // Block double-paying for the same course
    const user = await User.findById(userId).select("paidCourses").lean();
    if (user?.paidCourses?.some(pc => pc.courseId?.toString() === courseId && pc.isPaid)) {
      return res.status(409).json({ message: "You already have access to this course." });
    }

    const order = await rp.orders.create({
      amount:          amountINR * 100, // Razorpay expects paise
      currency:        "INR",
      receipt:         `c_${courseId.slice(-8)}_u_${userId.slice(-8)}_${Date.now().toString().slice(-6)}`,
      notes:           { userId: String(userId), courseId: String(courseId) },
      payment_capture: 1,
    });

    await Payment.create({
      user:            userId,
      courseId,
      amountINR,
      razorpayOrderId: order.id,
      status:          "created",
    });

    return res.json({
      orderId:    order.id,
      amount:     order.amount,    // paise — what Razorpay will charge
      currency:   order.currency,
      keyId:      RAZORPAY_KEY_ID, // safe to send — public key
      courseName: course.name,
      // Pricing breakdown for the frontend so it can display the correct
      // strikethrough MRP + payable + savings without recomputing.
      amountINR,                    // what the customer actually pays
      mrpINR:     mrp,              // original / MRP
      discountINR: discount,        // absolute rupees off
      discountPercent: dPct || null,
    });
  } catch (err) {
    console.error("createOrder error:", err?.message || err);
    console.error("createOrder stack:", err?.stack);
    // Surface Razorpay API errors directly so we can see them
    if (err?.error) console.error("Razorpay error detail:", JSON.stringify(err.error));
    return res.status(500).json({
      message: "Failed to create payment order",
      detail: err?.message || String(err),
    });
  }
};

/* ===========================
   POST /api/payments/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   Auth: protect (Bearer token)
=========================== */
export const verifyPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    if (!RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ message: "Payments are not configured on the server." });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Incomplete payment payload" });
    }

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) return res.status(404).json({ message: "Order not found" });
    if (payment.user.toString() !== userId) {
      return res.status(403).json({ message: "Order does not belong to you" });
    }
    if (payment.status === "paid") {
      return res.json({ success: true, alreadyPaid: true });
    }

    // Signature = HMAC_SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
    const expectedSig = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      payment.status        = "failed";
      payment.failureReason = "Signature mismatch on /verify";
      await payment.save();
      return res.status(400).json({ message: "Payment signature invalid" });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status            = "paid";
    await payment.save();

    const { user, course } = await markUserPaidForCourse({
      userId:   payment.user,
      courseId: payment.courseId,
    });

    // Fire-and-forget receipt email (don't block the response)
    if (user.email) {
      sendEmail(
        user.email,
        `Payment received — ${course.name}`,
        `Thanks ${user.f_name}, we received your payment of ₹${payment.amountINR} for ${course.name}.`,
        buildPaymentReceiptEmail({
          name:       user.f_name,
          courseName: course.name,
          amount:     payment.amountINR,
          orderId:    payment.razorpayOrderId,
          paymentId:  payment.razorpayPaymentId,
        }),
      ).catch((e) => console.error("Receipt email failed:", e.message));
    }

    return res.json({ success: true, courseId: payment.courseId });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ message: "Failed to verify payment" });
  }
};

/* ===========================
   POST /api/payments/webhook
   Razorpay → us. Mounted with express.raw in index.js so we can verify the
   raw body signature.
=========================== */

// First middleware on the route — sets req.webhookEvent if signature is valid.
export const verifyWebhookSignature = (req, res, next) => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).json({ message: "Webhook not configured" });
  }
  const sig  = req.headers["x-razorpay-signature"];
  const body = req.body; // Buffer — because of express.raw
  if (!sig || !Buffer.isBuffer(body)) {
    return res.status(400).json({ message: "Bad webhook payload" });
  }
  const expected = crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  if (expected !== sig) {
    return res.status(400).json({ message: "Webhook signature invalid" });
  }
  try {
    req.webhookEvent = JSON.parse(body.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Webhook payload not JSON" });
  }
  return next();
};

// Handler — reconciles whatever Razorpay tells us.
// Always returns 200 OK if the signature was valid, even on unknown events,
// otherwise Razorpay retries forever.
export const handleWebhook = async (req, res) => {
  try {
    const event   = req.webhookEvent;
    const evtName = event?.event;
    const entity  = event?.payload?.payment?.entity || event?.payload?.order?.entity;
    const orderId = entity?.order_id || entity?.id;

    if (!orderId) return res.json({ ok: true, ignored: true });

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) {
      console.warn("Webhook for unknown order:", orderId, evtName);
      return res.json({ ok: true, unknownOrder: true });
    }

    payment.lastWebhookEvent = evtName;
    payment.lastWebhookAt    = new Date();

    if (evtName === "payment.captured" || evtName === "order.paid") {
      if (payment.status !== "paid") {
        payment.razorpayPaymentId = entity.id || payment.razorpayPaymentId;
        payment.status            = "paid";
        await payment.save();
        // Mark user paid (idempotent)
        try {
          await markUserPaidForCourse({ userId: payment.user, courseId: payment.courseId });
        } catch (e) {
          console.error("Webhook mark-paid failed:", e.message);
        }
      } else {
        await payment.save();
      }
    } else if (evtName === "payment.failed") {
      payment.status        = "failed";
      payment.failureReason = entity.error_description || "Razorpay reported failure";
      await payment.save();
    } else if (evtName === "refund.processed" || evtName === "payment.refunded") {
      payment.status = "refunded";
      await payment.save();
    } else {
      await payment.save();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Still 200 so Razorpay doesn't infinite-retry; we logged the failure
    return res.json({ ok: false });
  }
};

/* ===========================
   POST /api/admin/grant-access
   Body: { userId, courseId, reason }
   Auth: verifyAdmin
   ───────────────────────────
   The ONLY way to grant paid access without a real Razorpay payment.
   Creates a Payment doc with source="admin_grant" so it's fully audited:
   who granted, when, why. Useful for support cases, comps, refunds-but-keep-access.
=========================== */
export const grantAccess = async (req, res) => {
  try {
    const { userId, courseId, reason } = req.body || {};
    if (!userId || !courseId) {
      return res.status(400).json({ message: "userId and courseId are required" });
    }
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ message: "Please provide a reason (min 5 chars)" });
    }

    const course = await Course.findById(courseId).select("name priceINR").lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    const { user, alreadyPaid } = await markUserPaidForCourse({ userId, courseId });
    if (alreadyPaid) {
      return res.json({ ok: true, alreadyPaid: true });
    }

    const grant = await Payment.create({
      user:          userId,
      courseId,
      amountINR:     0,
      source:        "admin_grant",
      status:        "granted",
      grantedBy:     req.admin?._id || null,
      grantedReason: String(reason).trim(),
    });

    return res.status(201).json({
      ok:       true,
      grantId:  grant._id,
      user: {
        id:   user._id,
        name: `${user.f_name} ${user.last_name}`.trim(),
      },
      course: { id: course._id, name: course.name },
    });
  } catch (err) {
    console.error("grantAccess error:", err);
    return res.status(500).json({ message: "Failed to grant access" });
  }
};

/* ===========================
   POST /api/admin/revoke-access
   Body: { userId, courseId, reason }
   Auth: verifyAdmin
   ───────────────────────────
   Strips paid access for a user+course. Creates a Payment doc with status="revoked"
   so the timeline is preserved. Won't touch real Razorpay payments — those need
   to go through the Razorpay refund flow (refund webhook flips them automatically).
=========================== */
export const revokeAccess = async (req, res) => {
  try {
    const { userId, courseId, reason } = req.body || {};
    if (!userId || !courseId) {
      return res.status(400).json({ message: "userId and courseId are required" });
    }
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ message: "Please provide a reason (min 5 chars)" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const entry = user.paidCourses.find(pc => pc.courseId?.toString() === String(courseId));
    if (!entry || !entry.isPaid) {
      return res.status(404).json({ message: "User does not have paid access to this course" });
    }

    entry.isPaid = false;
    entry.paidAt = null;
    await user.save();

    await Payment.create({
      user:          userId,
      courseId,
      amountINR:     0,
      source:        "admin_grant",
      status:        "revoked",
      revokedBy:     req.admin?._id || null,
      revokedReason: String(reason).trim(),
      revokedAt:     new Date(),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("revokeAccess error:", err);
    return res.status(500).json({ message: "Failed to revoke access" });
  }
};

/* ===========================
   GET /api/admin/payments
   Query: ?status=paid&courseId=&userId=&source=&limit=50
   Auth: verifyAdmin
=========================== */
export const listPayments = async (req, res) => {
  try {
    const { status, courseId, userId, source } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const q = {};
    if (status)   q.status   = status;
    if (source)   q.source   = source;
    if (courseId && mongoose.isValidObjectId(courseId)) q.courseId = courseId;
    if (userId   && mongoose.isValidObjectId(userId))   q.user     = userId;

    const items = await Payment.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user",      "f_name last_name email whatsappNo")
      .populate("courseId",  "name")
      .populate("grantedBy", "name email")
      .populate("revokedBy", "name email")
      .lean();

    return res.json(items.map(p => ({
      id:        p._id,
      source:    p.source,
      status:    p.status,
      amountINR: p.amountINR,
      orderId:   p.razorpayOrderId,
      paymentId: p.razorpayPaymentId,
      course:    p.courseId ? { id: p.courseId._id, name: p.courseId.name } : null,
      user:      p.user ? {
        id:         p.user._id,
        name:       `${p.user.f_name || ""} ${p.user.last_name || ""}`.trim(),
        email:      p.user.email,
        whatsappNo: p.user.whatsappNo,
      } : null,
      grantedBy:     p.grantedBy?.name || null,
      grantedReason: p.grantedReason || null,
      revokedBy:     p.revokedBy?.name || null,
      revokedReason: p.revokedReason || null,
      revokedAt:     p.revokedAt,
      createdAt:     p.createdAt,
    })));
  } catch (err) {
    console.error("listPayments error:", err);
    return res.status(500).json({ message: "Failed to list payments" });
  }
};

/* ===========================
   GET /api/payments/mine
   Auth: protect
=========================== */
export const myPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("courseId", "name")
      .lean();
    return res.json(payments.map(p => ({
      id:         p._id,
      course:     p.courseId?.name,
      amountINR:  p.amountINR,
      status:     p.status,
      orderId:    p.razorpayOrderId,
      paymentId:  p.razorpayPaymentId,
      createdAt:  p.createdAt,
    })));
  } catch (err) {
    console.error("myPayments error:", err);
    return res.status(500).json({ message: "Failed to fetch payments" });
  }
};
