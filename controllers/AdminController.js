import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import TestResult from '../models/TestResult.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yourSecretKey';

// 🔐 Admin Login — returns JWT token
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ message: 'Login successful', token, role: 'admin' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 👥 Fetch paid users — protected
export const getPaidUsers = async (req, res) => {
  try {
    console.log("Authenticated admin:", req.admin); // ✅ check if token is valid
    const users = await User.find({ verified: true })
      .select("name whatsappNo taluka username isPaid");
    res.status(200).json(users);
  } catch (err) {
    console.error("❌ Error in getPaidUsers:", err);
    res.status(500).json({ message: "Error fetching paid users", error: err });
  }
};


// ✅ Fetch all verified users — NEW
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ verified: true }).select("name whatsappNo taluka username isPaid");
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByIdAndUpdate(id, req.body, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error during update" });
  }
};

// DELETE user
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Server error during deletion" });
  }
};

// export const getAdminStats = async (req, res) => {
//   try {
//     const totalUsers = await User.countDocuments();
//     const paidUsers = await User.countDocuments({ isPaid: true });
//     const unpaidUsers = await User.countDocuments({ isPaid: false });
//     const totalTests = await TestResult.countDocuments();

//     const subjectStats = await TestResult.aggregate([
//       { $group: { _id: "$subject", count: { $sum: 1 } } }
//     ]);

//     res.json({
//       totalUsers,
//       paidUsers,
//       unpaidUsers,
//       totalTests,
//       subjectStats
//     });
//   } catch (err) {
//     console.error("Admin stats error:", err);
//     res.status(500).json({ message: "Failed to fetch stats" });
//   }
// };


export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const paidUsers = await User.countDocuments({ isPaid: true });
    const unpaidUsers = totalUsers - paidUsers;
    const totalTests = await TestResult.countDocuments();

    // Subject-wise test attempts
    const subjectStats = await TestResult.aggregate([
      {
        $group: {
          _id: "$subject",
          count: { $sum: 1 },
        },
      },
    ]);

    // ✅ Top 5 Scorers (avg score across all tests)
    const topScorers = await TestResult.aggregate([
      {
        $group: {
          _id: "$user",
          avgScore: { $avg: { $divide: ["$score", "$total"] } },
        },
      },
      { $sort: { avgScore: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          name: "$userDetails.name",
          taluka: "$userDetails.taluka",
          avgScore: { $round: [{ $multiply: ["$avgScore", 100] }, 1] }, // % rounded to 1 decimal
        },
      },
    ]);

    // ✅ Taluka-wise user distribution
    const talukaStats = await User.aggregate([
      {
        $group: {
          _id: "$taluka",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Final Response
    res.json({
      totalUsers,
      paidUsers,
      unpaidUsers,
      totalTests,
      subjectStats,
      topScorers,
      talukaStats,
    });

  } catch (err) {
    console.error("❌ Admin stats error:", err);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
};




export const getUserTestResults = async (req, res) => {
  const { userId } = req.params;

  try {
    const results = await TestResult.find({ user: userId }).sort({ createdAt: -1 });
    res.json(results);
  } catch (error) {
    console.error("Error fetching user's test results:", error);
    res.status(500).json({ message: "Failed to fetch user results" });
  }
};