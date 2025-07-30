import express from 'express';
import { loginAdmin, getPaidUsers, getAllUsers, updateUser, deleteUser, getAdminStats, getUserTestResults } from '../controllers/AdminController.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.get('/paid-users', verifyAdmin, getPaidUsers); // (optional, kept as-is)
router.get('/users', verifyAdmin, getAllUsers);       // ✅ New route
// PUT - Update user
router.put('/users/:id', verifyAdmin, updateUser);

// DELETE - Delete user
router.delete('/users/:id', verifyAdmin, deleteUser);
router.get("/stats", verifyAdmin, getAdminStats);
router.get('/user-tests/:userId', verifyAdmin, getUserTestResults);


export default router;
