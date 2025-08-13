// // Backend/controllers/testResultController.js
// import TestResult from '../models/TestResult.js';

// export const saveResult = async (req, res) => {
//   const { subject, chapter, score, total } = req.body;
//   const userId = req.user.id;

//   try {
//     const result = new TestResult({ user: userId, subject, chapter, score, total });
//     await result.save();
//     res.status(201).json({ message: "Result saved", result });
//   } catch (err) {
//     res.status(500).json({ message: "Error saving result", error: err.message });
//   }
// };

// export const getUserResults = async (req, res) => {
//   const userId = req.user.id;

//   try {
//     const results = await TestResult.find({ user: userId }).sort({ submittedAt: -1 });
//     res.status(200).json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching results", error: err.message });
//   }
// };
// controllers/testResultController.js
import TestResult from '../models/TestResult.js';
import User from '../models/User.js';

// export const saveTestResult = async (req, res) => {
//   const { subject, chapter, score, total, detailedResults } = req.body;
//   const userId = req.user.id;

//   try {
//     const result = new TestResult({
//       user: userId,
//       subject,
//       chapter,
//       score,
//       total,
//       details: detailedResults,
//     });

//     await result.save();

//     res.status(201).json({ message: "Result saved successfully" });
//   } catch (err) {
//     console.error("Save test result error:", err);
//     res.status(500).json({ message: "Failed to save result" });
//   }
// };

export const saveTheResult = async (req, res) => {
  const { subject, chapter, score, total, detailedResults, type = "chapter" } = req.body;
  const userId = req.user.id;

  try {
    const result = new TestResult({
      user: userId,
      subject,
      chapter,
      score,
      total,
      type, // e.g. "chapter", "mock", "manual"
      details: detailedResults,
    });

    await result.save();

    res.status(201).json({ message: "✅ Result saved successfully" });
  } catch (err) {
    console.error("❌ Save test result error:", err);
    res.status(500).json({ message: "Failed to save result" });
  }
};



export const getUserResults = async (req, res) => {
  try {
    const results = await TestResult.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ message: "Error fetching test results" });
  }
};

export const getUserTestResults = async (req, res) => {
  const userId = req.user.id;

  try {
    const results = await TestResult.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch test results" });
  }
};
// export const addManualTestResult = async (req, res) => {
//   const { testName, score, total } = req.body;
//   const userId = req.user?.id;

//   if (!userId) return res.status(401).json({ error: "Unauthorized" });

//   try {
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: "User not found" });

//     const result = new TestResult({
//       user: userId,
//       testName,
//       score,
//       total,
//       isManual: true,
//     });

//     await result.save();
//     res.status(201).json({ message: "Manual test result added", result });
//   } catch (err) {
//     console.error("Add manual result error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// };

export const addManualTestByUser = async (req, res) => {
  const { testName, score, total } = req.body;
  const userId = req.user.id;

  try {
    const result = new TestResult({ user: userId, testName, score, total });
    await result.save();
    res.status(201).json({ message: "Test added manually" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addManualTestByAdmin = async (req, res) => {
  const { userId, testName, score, total } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = new TestResult({ user: userId, testName, score, total });
    await result.save();
    res.status(201).json({ message: "Manual test added by admin" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /results/:id
export const updateTestResult = async (req, res) => {
  const { id } = req.params;
  const { subject, chapter, score, total } = req.body;

  try {
    const result = await TestResult.findById(id);
    if (!result) return res.status(404).json({ message: "Test result not found" });

    // Only allow owner to update
    if (result.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to edit this test" });
    }

    result.subject = subject;
    result.chapter = chapter;
    result.score = score;
    result.total = total;

    await result.save();
    res.status(200).json({ message: "Test updated successfully" });
  } catch (err) {
    console.error("Update test error:", err);
    res.status(500).json({ message: "Failed to update test" });
  }
};

// DELETE /results/:id
export const deleteTestResult = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await TestResult.findById(id);
    if (!result) return res.status(404).json({ message: "Test result not found" });

    // Only allow owner to delete
    if (result.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this test" });
    }

    await result.deleteOne();
    res.status(200).json({ message: "Test deleted successfully" });
  } catch (err) {
    console.error("Delete test error:", err);
    res.status(500).json({ message: "Failed to delete test" });
  }
};