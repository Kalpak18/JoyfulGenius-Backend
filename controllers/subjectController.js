// controllers/subjectController.js
import Subject from "../models/subject.js";
import Course from "../models/Course.js";

// ✅ Add Subject (linked to a valid course)
export const createSubject = async (req, res) => {
  try {
    const { name, description, courseId } = req.body;

    // Check if course exists
    const courseExists = await Course.findById(courseId);
    if (!courseExists) {
      return res.status(404).json({ message: "Course not found" });
    }

    const subject = new Subject({
      name,
      description,
      courseId
    });

    await subject.save();

    res.status(201).json({ message: "Subject added successfully", subject });
  } catch (error) {
    res.status(500).json({ message: "Error adding subject", error: error.message });
  }
};

// ✅ List all subjects (with course name populated)
// export const listSubjects = async (req, res) => {
//   try {
//     const subjects = await Subject.find()
//       .populate("courseId", "name") // FIX: use name instead of title
//       .sort({ createdAt: -1 });

//     res.status(200).json(subjects);
//   } catch (error) {
//     res.status(500).json({ message: "Error fetching subjects", error: error.message });
//   }
// };
export const listSubjects = async (req, res) => {
  try {
    const { courseId } = req.query;               // get courseId from query
    const filter = courseId ? { courseId } : {};  // filter if present

    const subjects = await Subject.find(filter)
      .populate("courseId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json(subjects);
  } catch (error) {
    res.status(500).json({ message: "Error fetching subjects", error: error.message });
  }
};

// ✅ Get subject by ID (with course name populated)
export const getSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate("courseId", "name"); // FIX: use name

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    res.status(200).json(subject);
  } catch (error) {
    res.status(500).json({ message: "Error fetching subject", error: error.message });
  }
};

// ✅ Update subject
export const updateSubject = async (req, res) => {
  try {
    const { name, description, courseId } = req.body;

    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { name, description, courseId },
      { new: true }
    );

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    res.status(200).json({ message: "Subject updated successfully", subject });
  } catch (error) {
    res.status(500).json({ message: "Error updating subject", error: error.message });
  }
};

// ✅ Delete subject
export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    res.status(200).json({ message: "Subject deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting subject", error: error.message });
  }
};

// ✅ Group subjects by course (used for dropdowns or course-wise view)
export const listSubjectsGroupedByCourse = async (req, res) => {
  try {
    const subjects = await Subject.aggregate([
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          as: "course"
        }
      },
      { $unwind: "$course" },
      {
        $group: {
          _id: "$courseId",
          courseName: { $first: "$course.name" }, // FIX: use name
          courseDescription: { $first: "$course.description" },
          subjects: {
            $push: {
              _id: "$_id",
              name: "$name",
              description: "$description",
              createdAt: "$createdAt",
              updatedAt: "$updatedAt"
            }
          }
        }
      },
      { $sort: { courseName: 1 } },
      {
        $project: {
          _id: 1,
          courseName: 1,
          courseDescription: 1,
          subjects: {
            $sortArray: { input: "$subjects", sortBy: { name: 1 } }
          }
        }
      }
    ]);

    res.status(200).json(subjects);
  } catch (error) {
    res.status(500).json({ message: "Error fetching subjects grouped by course", error: error.message });
  }
};

// GET /api/subjects/by-name/:courseId/:subjectName
export const getSubjectByName = async (req, res) => {
  try {
    const { courseId, subjectName } = req.params;
    const subject = await Subject.findOne({
      courseId,
      name: { $regex: new RegExp(`^${subjectName}$`, "i") } // case-insensitive match
    });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    res.json(subject);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// import Subject from '../models/subject.js';
// import Course from '../models/Course.js';

// /**
//  * POST /api/subjects
//  */
// export const createSubject = async (req, res) => {
//   try {
//     const { courseId, name, description } = req.body;

//     // Ensure course exists
//     const courseExists = await Course.findById(courseId);
//     if (!courseExists) {
//       return res.status(404).json({ success: false, message: 'Course not found' });
//     }

//     const subject = await Subject.create({
//       courseId,
//       name: name.trim(),
//       description: description?.trim() || '',
//     });

//     return res.status(201).json({ success: true, data: subject });
//   } catch (err) {
//     if (err.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message: 'Subject with this name already exists in this course',
//       });
//     }
//     console.error('Create subject error:', err);
//     return res.status(500).json({ success: false, message: 'Server error creating subject' });
//   }
// };

// /**
//  * GET /api/subjects
//  */
// export const listSubjects = async (req, res) => {
//   try {
//     const subjects = await Subject.find()
//       .populate('courseId', 'title')
//       .sort({ createdAt: -1 });

//     return res.json({ success: true, data: subjects });
//   } catch (err) {
//     console.error('List subjects error:', err);
//     return res.status(500).json({ success: false, message: 'Server error fetching subjects' });
//   }
// };

// /**
//  * GET /api/subjects/:id
//  */
// export const getSubject = async (req, res) => {
//   try {
//     const subject = await Subject.findById(req.params.id)
//       .populate('courseId', 'title');

//     if (!subject) {
//       return res.status(404).json({ success: false, message: 'Subject not found' });
//     }

//     return res.json({ success: true, data: subject });
//   } catch (err) {
//     console.error('Get subject error:', err);
//     return res.status(500).json({ success: false, message: 'Server error fetching subject' });
//   }
// };

// /**
//  * PUT /api/subjects/:id
//  */
// export const updateSubject = async (req, res) => {
//   try {
//     const { name, description } = req.body;

//     const subject = await Subject.findByIdAndUpdate(
//       req.params.id,
//       {
//         ...(name && { name: name.trim() }),
//         ...(description !== undefined && { description: description.trim() }),
//       },
//       { new: true, runValidators: true }
//     );

//     if (!subject) {
//       return res.status(404).json({ success: false, message: 'Subject not found' });
//     }

//     return res.json({ success: true, data: subject });
//   } catch (err) {
//     if (err.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message: 'Subject with this name already exists in this course',
//       });
//     }
//     console.error('Update subject error:', err);
//     return res.status(500).json({ success: false, message: 'Server error updating subject' });
//   }
// };

// /**
//  * DELETE /api/subjects/:id
//  */
// export const deleteSubject = async (req, res) => {
//   try {
//     const subject = await Subject.findByIdAndDelete(req.params.id);
//     if (!subject) {
//       return res.status(404).json({ success: false, message: 'Subject not found' });
//     }
//     return res.json({ success: true, message: 'Subject deleted successfully' });
//   } catch (err) {
//     console.error('Delete subject error:', err);
//     return res.status(500).json({ success: false, message: 'Server error deleting subject' });
//   }
// };


// /**
//  * GET /api/subjects/grouped
//  * Groups subjects by course
//  */
// export const listSubjectsGroupedByCourse = async (req, res) => {
//   try {
//     const subjects = await Subject.aggregate([
//       {
//         $lookup: {
//           from: 'courses',
//           localField: 'courseId',
//           foreignField: '_id',
//           as: 'course'
//         }
//       },
//       { $unwind: '$course' },
//       {
//         $group: {
//           _id: '$courseId',
//           courseTitle: { $first: '$course.title' },
//           courseDescription: { $first: '$course.description' },
//           subjects: {
//             $push: {
//               _id: '$_id',
//               name: '$name',
//               description: '$description',
//               createdAt: '$createdAt',
//               updatedAt: '$updatedAt'
//             }
//           }
//         }
//       },
//       { $sort: { courseTitle: 1 } },
//       {
//         $project: {
//           _id: 1,
//           courseTitle: 1,
//           courseDescription: 1,
//           subjects: {
//             $sortArray: { input: '$subjects', sortBy: { name: 1 } }
//           }
//         }
//       }
//     ]);

//     return res.json({ success: true, data: subjects });
//   } catch (err) {
//     console.error('Grouped subjects error:', err);
//     return res.status(500).json({ success: false, message: 'Server error fetching grouped subjects' });
//   }
// };
