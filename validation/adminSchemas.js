// validation/adminSchemas.js
import { z } from "zod";
import { objectId, email, phone10 } from "./shared.js";

// Admin login
export const loginAdminSchema = {
  body: z.object({
    email,
    password: z.string().min(6)
  })
};

// Update user (by admin)
export const updateUserSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    f_name: z.string().trim().min(1),
    last_name: z.string().trim().min(1),
    whatsappNo: phone10,
    district: z.string().trim().min(1),
    username: z.string().trim().min(3).optional(),
    isPaid: z.boolean().optional(), // keep legacy support
  }),
};

// Delete user
export const deleteUserSchema = {
  params: z.object({ id: objectId })
};

// Get a user's test results
export const getUserTestResultsSchema = {
  params: z.object({ userId: objectId })
};

// List all users; optionally filter by course
export const getAllUsersSchema = {
  query: z.object({
    courseId: objectId.optional()
  })
};

// List paid users; optionally filter by course
export const getPaidUsersSchema = {
  query: z.object({
    courseId: objectId.optional()
  })
};

// Admin stats; optionally scoped to a course
export const getAdminStatsSchema = {
  query: z.object({
    courseId: objectId.optional()
  })
};

// Touch/auto-enroll on course visit (Auth controller endpoint)
export const touchCourseEnrollmentSchema = {
  params: z.object({ courseId: objectId })
};
