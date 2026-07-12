// validation/userSchemas.js
import { z } from "zod";
import { phone10, emailOpt, password, firstName, lastName, district, objectId } from "./shared.js";

const identifier = z.union([emailOpt, phone10]);
// Registration STEP 1 (sends email OTP, stages user)
// Email is REQUIRED now since it's how we verify
export const registerUserSchema = {
  body: z.object({
    f_name:     firstName,
    last_name:  lastName,
    email:      z.string().trim().toLowerCase().email("Invalid email"),
    whatsappNo: phone10,
    district:   district,
    password:   password
  })
};

// Registration STEP 2 (verifies the code, creates the User)
export const verifyUserOtpSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email"),
    code:  z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
  })
};

// Resend OTP during pending registration
export const resendRegistrationOtpSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email"),
  })
};

// Login (email OR whatsappNo/identifier + password)
export const loginUserSchema = {
  body: z.object({
    identifier: identifier,
    password: z.string().min(6, "Password must be at least 6 characters")
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
