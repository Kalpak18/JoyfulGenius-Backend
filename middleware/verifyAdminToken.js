import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'yourSecretKey'; // Replace with env secret in production

// Middleware to verify admin JWT token
export const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if authorization header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.id; // You can use this to fetch admin details later
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
