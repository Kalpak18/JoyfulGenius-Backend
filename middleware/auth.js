// middleware/auth.js
// middleware/auth.js
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

export const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Admin token missing" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(403).json({ message: "Unauthorized admin" });

    req.admin = admin;
    next();
  } catch (err) {
    console.error("Admin verification failed:", err);
    res.status(403).json({ message: "Forbidden" });
  }
};

export const verifyUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // will contain user ID
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

// export const verifyUser = async (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ message: "Unauthorized - No token" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = await User.findById(decoded.id).select("-password");
//     if (!req.user) return res.status(404).json({ message: "User not found" });
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: "Unauthorized - Invalid token" });
//   }
// };