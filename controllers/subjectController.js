import Subject from '../models/subject.js';

export const createSubject = async (req, res) => {
  try {
    const subject = await Subject.create({ name: req.body.name });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
