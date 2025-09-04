import Course from "../models/Course.js";
import User from "../models/User.js";
import Chapter from "../models/chapter.js";
import subject from "../models/subject.js";
import mongoose from "mongoose";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/* Create a new course */
export const createCourse = async (req, res) => {
   try {
    const { name, description, language, autoGenerateUsername, customUsername, noUsername, usernameFormat } = req.body;

     const course = new Course({
      name,
      description,
      language,
      autoGenerateUsername: !!autoGenerateUsername,
      customUsername: !!customUsername,
      noUsername: !!noUsername,
      usernameFormat: usernameFormat || "{serial}.{fname}{lname}.{district}"
    });

    await course.save();
    res.status(201).json(course);
  } catch (err) {
    console.error("Error creating course:", err);
    res.status(500).json({ message: "Failed to create course" });
  }
};

/* -------------------- Update Course -------------------- */
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, language, autoGenerateUsername, customUsername, noUsername, usernameFormat } = req.body;

    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      {
        name,
        description,
        language,
       autoGenerateUsername: !!autoGenerateUsername,
        customUsername: !!customUsername,
        noUsername: !!noUsername,
        usernameFormat: usernameFormat || "{serial}.{fname}{lname}.{district}"
      },
      { new: true }
    );

    if (!updatedCourse) return res.status(404).json({ message: "Course not found" });

    res.json(updatedCourse);
  } catch (err) {
    console.error("Error updating course:", err);
    res.status(500).json({ message: "Failed to update course" });
  }
};


/* Get all courses */
export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.status(200).json({ message: "Courses fetched", data: courses });
  } catch (err) {
    console.error("Get courses error:", err);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
};



/* Enroll a user into a course */
export const enrollUser = async (req, res) => {
  try {
    const { courseId, userId } = req.body;

    const [course, user] = await Promise.all([
      Course.findById(courseId),
      User.findById(userId),
    ]);

    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Add to Course.enrolledUsers (optional, if you still want it)
    if (!course.enrolledUsers.includes(userId)) {
      course.enrolledUsers.push(userId);
      await course.save();
    }

    // Add to User.paidCourses if not exists
    const alreadyEnrolled = user.paidCourses.find(pc => pc.courseId.toString() === courseId);
    if (!alreadyEnrolled) {
      user.paidCourses.push({
        courseId,
        isPaid: false,
        username: null,
        progress: {},
        testResults: []
      });
      await user.save();
    }

    res.status(200).json({ message: "User enrolled in course" });
  } catch (err) {
    console.error("Enroll user error:", err);
    res.status(500).json({ message: "Failed to enroll user" });
  }
};


/* Delete course and related chapters */
export const deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findByIdAndDelete(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // delete related chapters and subjects
    await Chapter.deleteMany({ courseId: toObjectId(courseId) });
    await subject.deleteMany({ courseId: toObjectId(courseId) });

    return res.status(200).json({ message: "Course and related subjects & chapters deleted" });
  } catch (err) {
    console.error("Delete course error:", err.message || err);
    return res.status(500).json({ message: "Failed to delete course", error: err.message });
  }
};


/**
 * Fetch all courses for the user
 */

export const getCoursesForUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Optional: frontend can send custom order of course names
    const { order } = req.body; // e.g., { order: ["NMMS", "Homibhabha"] }

    let courses;
    if (Array.isArray(order) && order.length > 0) {
      // Fetch only courses in the order array
      const fetchedCourses = await Course.find({ name: { $in: order } });

      // Preserve the sequence
      courses = order
        .map(name => fetchedCourses.find(c => c.name === name))
        .filter(Boolean); // remove any names not found in DB
    } else {
      // Default: all courses sorted by createdAt
      courses = await Course.find().sort({ createdAt: -1 });
    }

    const coursesWithStatus = courses.map(course => {
      const paidInfo = user.paidCourses.find(pc => pc.courseId.toString() === course._id.toString());
      return {
        _id: course._id,
        name: course.name,
        description: course.description,
        language: course.language,
        autoGenerateUsername: course.autoGenerateUsername,
        customUsername: course.customUsername,
        noUsername: course.noUsername,
        usernameFormat: course.usernameFormat,
        isPaid: paidInfo?.isPaid || false,
        username: paidInfo?.username || null,
        paidAt: paidInfo?.paidAt || null
      };
    });

    res.status(200).json({ message: "Courses fetched", data: coursesWithStatus });
  } catch (err) {
    console.error("Get courses for user error:", err);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
};

export const getCourseByNameForUser = async (req, res) => {
  try {
    const { coursename } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const course = await Course.findOne({ name: coursename.trim() });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const paidInfo = user.paidCourses.find(pc => pc.courseId.toString() === course._id.toString());

    res.status(200).json({
      _id: course._id,
      name: course.name,
      description: course.description,
      language: course.language,
      autoGenerateUsername: course.autoGenerateUsername,
      customUsername: course.customUsername,
      noUsername: course.noUsername,
      usernameFormat: course.usernameFormat,
      isPaid: !!paidInfo,
      username: paidInfo?.username || null,
      paidAt: paidInfo?.paidAt || null
    });
  } catch (err) {
    console.error("Get course by name error:", err);
    res.status(500).json({ message: "Failed to fetch course" });
  }
};

// export const getUsersByCourse = async (req, res) => {
//   try {
//     const { courseId } = req.params;

//     // Ensure course exists
//     const course = await Course.findById(courseId);
//     if (!course) return res.status(404).json({ message: "Course not found" });

//     // Find all users enrolled in this course
//     const users = await User.find({ "paidCourses.courseId": courseId })
//       .select("name email paidCourses");

//     // Extract only this course’s enrollment info
//     const formatted = users.map(u => {
//       const enrollment = u.paidCourses.find(pc => pc.courseId.toString() === courseId);
//       return {
//         userId: u._id,
//         name: u.name,
//         email: u.email,
//         username: enrollment?.username || null,
//         isPaid: enrollment?.isPaid || false,
//         serial: enrollment?.serial || null,
//         progress: enrollment?.progress || {},
//         testResults: enrollment?.testResults || []
//       };
//     });

//     res.json(formatted);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// PATCH update user info in a specific course
export const updateUserInCourse = async (req, res) => {
  try {
    const { courseId, userId } = req.params;
    const { isPaid, username, progress, testResults } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Find enrollment entry
    const enrollment = user.paidCourses.find(pc => pc.courseId.toString() === courseId);
    if (!enrollment) {
      return res.status(400).json({ message: "User not enrolled in this course" });
    }

    // Update only fields for this course
    if (typeof isPaid !== "undefined") enrollment.isPaid = isPaid;
    if (typeof username !== "undefined") enrollment.username = username;
    if (progress) enrollment.progress = progress;
    if (testResults) enrollment.testResults = testResults;

    await user.save();

    res.json({ message: "User updated for this course", enrollment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Controller
export const removeUserFromCourse = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    const [course, user] = await Promise.all([
      Course.findById(courseId),
      User.findById(userId),
    ]);

    if (!course || !user) 
      return res.status(404).json({ message: "Course or user not found" });

    // Remove userId from course.enrolledUsers
    course.enrolledUsers = course.enrolledUsers.filter(id => id.toString() !== userId);
    await course.save();

    // Remove the enrollment entry in user.paidCourses for this course
    user.paidCourses = user.paidCourses.filter(pc => pc.courseId.toString() !== courseId);
    await user.save();

    res.status(200).json({ message: "User removed from course" });
  } catch (err) {
    console.error("Error removing user from course:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
