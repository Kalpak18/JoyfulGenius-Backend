import Chapter from "../models/chapter.js";

// POST: Create or update chapter
export const createOrUpdateChapter = async (req, res) => {
  try {
    const { subject, title, language, youtubeCode, freetestCode, mastertestCode } = req.body;

    const chapter = await Chapter.findOneAndUpdate(
      { subject, title, language },
      { youtubeCode, freetestCode, mastertestCode },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: "Chapter saved", chapter });
  } catch (error) {
    console.error("Error saving chapter:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET: All chapters (optional)
export const getAllChapters = async (req, res) => {
  try {
    const chapters = await Chapter.find().sort({ subject: 1, title: 1 });
    res.status(200).json(chapters);
  } catch (error) {
    res.status(500).json({ message: "Error fetching chapters" });
  }
};

// DELETE: Delete a chapter
export const deleteChapter = async (req, res) => {
  try {
    const { id } = req.params;
    await Chapter.findByIdAndDelete(id);
    res.status(200).json({ message: "Chapter deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting chapter" });
  }
};
