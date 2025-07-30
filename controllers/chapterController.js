import Chapter from '../models/chapter.js';

export const createChapter = async (req, res) => {
  try {
    const chapter = await Chapter.create({
      name: req.body.name,
      subject: req.body.subjectId
    });
    res.status(201).json(chapter);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getChaptersBySubject = async (req, res) => {
  try {
    const chapters = await Chapter.find({ subject: req.params.subjectId });
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
