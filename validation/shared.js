// validation/shared.js
import { z } from "zod";

// Accepts various inputs and normalizes to a 10-digit string (India)
export const phone10 = z.preprocess((v) => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.slice(-10);
}, z.string().length(10, "Must be a valid 10-digit mobile number"));

// Mongo ObjectId (string)
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

// Basic email (optional in some flows)
export const emailOpt = z
  .preprocess((val) => {
    if (typeof val === "string" && val.trim() === "") return undefined;
    return val;
  }, z.string().trim().email("Invalid email format").optional());


// Password policy (keep in sync with your UI)
export const password = z.string().min(6, "Password must be at least 6 characters");

// Name fields
export const firstName = z.string().trim().min(1, "First name is required");
export const lastName  = z.string().trim().min(1, "Last name is required");
export const district  = z.string().trim().min(1, "District is required");

export const email = z
  .string()
  .trim()
  .email("Invalid email format")
  