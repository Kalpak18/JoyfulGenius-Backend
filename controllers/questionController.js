import Question from '../models/question.js';

// Add question
export const addQuestion = async (req, res) => {
  try {
    const { subject, chapter, question, options, correctAnswer } = req.body;
    if (!subject || !chapter || !question || !options || correctAnswer === undefined) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const newQuestion = new Question({ subject, chapter, question, options, correctAnswer });
    await newQuestion.save();
    res.status(201).json({ message: 'Question added successfully' });
  } catch (err) {
    console.error('Add question error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get questions by subject and chapter
// export const getQuestions = async (req, res) => {
//   try {
//     const { subject, chapter } = req.params;
//     const decodedChapter = decodeURIComponent(chapter); // just in case

//     const questions = await Question.find({
//       subject,
//       chapter: decodedChapter,
//     });

//     if (questions.length === 0) {
//       return res.status(404).json({ message: 'No questions found' });
//     }

//     res.json(questions);
//   } catch (error) {
//     console.error("Get question error:", error);
//     res.status(500).json({ error: 'Failed to fetch questions' });
//   }
// };

export const getQuestions = async (req, res) => {
  try {
    const { subject, chapter } = req.params;
    
    // Multi-step decoding and normalization
    let decodedChapter;
    try {
      decodedChapter = decodeURIComponent(chapter);
      // Additional normalization for Marathi text
      decodedChapter = decodedChapter
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/[।॥]/g, '') // Remove Hindi/Marathi punctuation
        .trim();
    } catch (e) {
      decodedChapter = chapter; // Fallback to raw if decoding fails
    }

    // Debug logging
    console.log('Received chapter:', {
      raw: chapter,
      decoded: decodedChapter,
      length: decodedChapter.length
    });

    // Find with multiple matching strategies
    const questions = await Question.find({
      subject: { $regex: new RegExp(`^${subject}$`, 'i') },
      $or: [
        { chapter: decodedChapter }, // Exact match
        { chapter: { $regex: new RegExp(decodedChapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }, // Partial match
        { chapter: { $regex: new RegExp(chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } } // Fallback to raw match
      ]
    });

    if (questions.length === 0) {
      // Diagnostic response
      const allChapters = await Question.distinct('chapter', { subject });
      return res.status(404).json({
        message: 'No questions found',
        attemptedMatches: {
          decodedChapter,
          rawChapter: chapter
        },
        availableChapters: allChapters
      });
    }

    res.json(questions);
  } catch (error) {
    console.error("Get question error:", {
      error: error.message,
      params: req.params,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to fetch questions',
      diagnostic: 'Check server logs for decoding details' 
    });
  }
};

// Delete question
export const deleteQuestion = async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
};

// Update a question
export const updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question, options, correctAnswer } = req.body;

  try {
    const updated = await Question.findByIdAndUpdate(
      id,
      { question, options, correctAnswer },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Question not found' });

    res.json({ message: 'Question updated', question: updated });
  } catch (error) {
    console.error("Update question error:", error);
    res.status(500).json({ error: 'Failed to update question' });
  } 
};

// Get unique subject/chapter combinations for filtering
export const getQuestionMetadata = async (req, res) => {
  try {
    const metadata = await Question.aggregate([
      {
        $group: {
          _id: { subject: "$subject", chapter: "$chapter" }
        }
      },
      {
        $project: {
          _id: 0,
          subject: "$_id.subject",
          chapter: "$_id.chapter"
        }
      }
    ]);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ message: "Error fetching question metadata" });
  }
};
