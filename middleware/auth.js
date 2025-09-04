// middleware/auth.js
import jwt from "jsonwebtoken";
import { env } from "../config/validateEnv.js";
import Admin from "../models/Admin.js";
import User from "../models/User.js";

const { JWT_SECRET } = env;

/**
 * Minimal protect middleware:
 * - Verifies short-lived access token (Bearer)
 * - Populates req.user = { id, ver, role }
 */
export const protect = (req, res, next) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Backward-compatible: allow old tokens with { id }
    const id = payload.sub;
    if (!id) return res.status(401).json({ message: "Invalid token payload" });

    req.user = { id, ver: payload.ver, role: payload.role || "user" };
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(401).json({ message: "Token invalid" });
  }
};

/**
 * Strong user verification:
 * - Verifies token
 * - Ensures user still exists (handles deleted/blocked users)
 */
export const verifyUser = async (req, res, next) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = auth.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = payload.sub ;
    if (!id) return res.status(401).json({ message: "Invalid token payload" });

    const user = await User.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    req.user = { id: user._id.toString(), ver: payload.ver, role: payload.role || "user", user };
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(401).json({ message: "Token invalid" });
  }
};

/**
 * Admin verification:
 * - Verifies token
 * - Ensures admin still exists
 */

export const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const id = decoded.sub;   // ✅ use only sub, not id

    if (!id) {
      return res.status(401).json({ message: "Invalid token payload." });
    }

    // ✅ enforce role check
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Not an admin token." });
    }

    const admin = await Admin.findById(id).select("-password");
    if (!admin) {
      return res.status(403).json({ message: "Unauthorized admin." });
    }

    // ✅ enforce token version check
    if (decoded.ver !== (admin.tokenVersion || 0)) {
      return res.status(403).json({ message: "Token revoked. Please login again." });
    }

    req.admin = admin;
    req.tokenData = { ver: decoded.ver, role: decoded.role };

    return next();
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Token expired."
        : "Invalid or expired token.";
    return res.status(401).json({ message: msg });
  }
};


/* ---------------------------
   Legacy (commented) version:
   Updated for future use
-----------------------------

// export const verifyUser = async (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ message: "Unauthorized - No token" });
//
//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     const id = decoded.sub || decoded.id;
//     req.user = await User.findById(id).select("-password");
//     if (!req.user) return res.status(404).json({ message: "User not found" });
//     next();
//   } catch (err) {
//     const msg = err.name === "TokenExpiredError" ? "Token expired" : "Unauthorized - Invalid token";
//     return res.status(401).json({ message: msg });
//   }
// };







// // middleware/auth.js
// // middleware/auth.js
// import jwt from "jsonwebtoken";
// import Admin from "../models/Admin.js";

// const { JWT_SECRET } = env;

// export const verifyAdmin = async (req, res, next) => {
//   try {
//     const token = req.headers.authorization?.split(" ")[1];
//     if (!token) return res.status(401).json({ message: "Admin token missing" });

//     const decoded = jwt.verify(token, JWT_SECRET);
    
//     const admin = await Admin.findById(decoded.id);
//     if (!admin) return res.status(403).json({ message: "Unauthorized admin" });

//     req.admin = admin;
//     next();
//   } catch (err) {
//     console.error("Admin verification failed:", err);
//     res.status(403).json({ message: "Forbidden" });
//   }
// };



  
// export const verifyUser = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   const token = authHeader.split(" ")[1];

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = decoded; // will contain user ID
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: "Token invalid or expired" });
//   }
// };

// // export const verifyUser = async (req, res, next) => {
// //   const token = req.headers.authorization?.split(" ")[1];
// //   if (!token) return res.status(401).json({ message: "Unauthorized - No token" });

// //   try {
// //     const decoded = jwt.verify(token, JWT_SECRET);
// //     req.user = await User.findById(decoded.id).select("-password");
// //     if (!req.user) return res.status(404).json({ message: "User not found" });
// //     next();
// //   } catch (err) {
// //     return res.status(401).json({ message: "Unauthorized - Invalid token" });
// //   }
// // };*/