// validation/userSchemas.js
import { z } from "zod";
import { phone10, emailOpt, password, firstName, lastName, district, objectId } from "./shared.js";

const identifier = z.union([emailOpt, phone10]);
// Registration (no OTP variant)
export const registerUserSchema = {
  body: z.object({
    f_name:     firstName,
    last_name:  lastName,
    email:      emailOpt, // optional
    whatsappNo: phone10,
    district:   district,
    password:   password
  })
};

// OTP registration completion (verifyUserOtp)
export const verifyUserOtpSchema = {
  body: z.object({
    whatsappNo: phone10.or(z.string().regex(/^\+?[0-9]{10,15}$/)),
    mobile:     z.string().optional(),
    code:       z.string().trim().min(4).max(8),
    user: z.object({
      f_name:     z.string().trim().default(""),
      last_name:  z.string().trim().default(""),
      email:      z.string().trim().email().optional(),
      password:   z.string().min(6).optional(),
      district:   z.string().trim().default("")
    }).default({})
  })
};

// Login (email OR whatsappNo/identifier + password)
export const loginUserSchema = {
  body: z.object({
    identifier: identifier,
    password: z.string().min(6, "Password must be at least 6 characters")
  })
};

// Forgot password via mobile OTP (forgotPasswordMobile)
export const forgotPasswordMobileSchema = {
  body: z.object({
    whatsappNo: phone10.or(z.string().regex(/^\+?[0-9]{10,15}$/).optional()),
    mobile:     z.string().optional(),
  })
};

// Verify reset OTP and issue reset token (verifyResetOtp)
export const verifyResetOtpSchema = {
  body: z.object({
    whatsappNo: phone10.or(z.string().regex(/^\+?[0-9]{10,15}$/).optional()),
    mobile:     z.string().optional(),
    code:       z.string().trim().min(4).max(8)
  })
};

// Forgot password via email link
export const forgotPasswordSchema = {
  body: z.object({
    email: z.string().trim().email()
  })
};

// Reset password with token param
export const resetPasswordSchema = {
  params: z.object({
    token: z.string().min(10)
  }),
  body: z.object({
    password: password
  })
};

// Update email
export const updateEmailSchema = {
  body: z.object({
    email: z.string().trim().email()
  })
};


export const markPaidForCourseSchema = {
  body: z.object({
    userId: objectId,
    courseId: objectId
  })
};

export const unmarkPaidForCourseSchema = {
  body: z.object({
    userId: objectId,
    courseId: objectId
  })
};

// togglePaidStatus params
export const togglePaidStatusForCourseSchema = {
  params: z.object({
    userId: objectId,
    courseId: objectId
  })
};


// getCurrentUser schema
export const getCurrentUserSchema = {
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
};
