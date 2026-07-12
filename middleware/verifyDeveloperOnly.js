// middleware/verifyDeveloperOnly.js
//
// Guard for /api/developer/* protected routes.
//
// Separate from verifyAdmin so:
//   - A developer JWT cannot accidentally satisfy an admin route
//   - An admin JWT cannot satisfy a developer route
//   - The two auth surfaces stay decoupled
//
// Populates req.developer (not req.admin) so downstream code never confuses
// the two.

import jwt from "jsonwebtoken";
import { env } from "../config/validateEnv.js";
import Admin from "../models/Admin.js";

const { JWT_SECRET } = env;

export const verifyDeveloperOnly = async (req, res, next) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Developer auth required" });
  }
  const token = auth.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "developer") {
      return res.status(403).json({ message: "Not a developer token" });
    }
    const dev = await Admin.findById(decoded.sub).select("-password");
    if (!dev || dev.role !== "developer") {
      return res.status(403).json({ message: "Developer account not found" });
    }
    if (decoded.ver !== (dev.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked. Please login again." });
    }
    req.developer = dev;
    return next();
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid or expired token";
    return res.status(401).json({ message: msg });
  }
};
