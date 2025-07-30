import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
const execPromise = util.promisify(exec);

/**
 * Extracts video duration in seconds
 * @param {string} url - Video URL or file path
 * @returns {Promise<number>} - Duration in seconds
 */
export const getVideoDuration = async (url) => {
  try {
    // Handle YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return await getYouTubeDuration(url);
    }
    
    // Handle local file paths (if processing uploaded videos)
    if (url.startsWith('/uploads/')) {
      return await getLocalVideoDuration(`.${url}`);
    }

    // Default fallback
    return 0;
  } catch (error) {
    console.error('Error getting video duration:', error);
    return 0; // Return 0 if duration can't be determined
  }
};

// YouTube Duration Fetcher
const getYouTubeDuration = async (url) => {
  try {
    // Extract video ID
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|youtu\.be\/)([^"&?\/\s]{11}))/i)?.[1];
    if (!videoId) return 0;

    // Call YouTube API
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${process.env.YOUTUBE_API_KEY}`
    );

    const durationStr = response.data.items[0]?.contentDetails?.duration;
    if (!durationStr) return 0;

    // Convert ISO 8601 duration to seconds
    return parseYouTubeDuration(durationStr);
  } catch (error) {
    console.error('YouTube API error:', error.message);
    return 0;
  }
};

// Parse YouTube's ISO 8601 duration format
const parseYouTubeDuration = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

// Local Video Duration (requires ffmpeg)
const getLocalVideoDuration = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn('Video file not found:', filePath);
      return 0;
    }

    // Use ffprobe (comes with ffmpeg)
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    
    return Math.round(parseFloat(stdout));
  } catch (error) {
    console.error('FFprobe error:', error.message);
    return 0;
  }
};

// Utility function to format seconds to HH:MM:SS
export const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
};