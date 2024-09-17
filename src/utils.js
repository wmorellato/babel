const vscode = require('vscode');
const path = require('path');

/**
 * Formats the story title to have an uniform filename.
 * @param {string} storyTitle 
 */
function titleToFilename(storyTitle) {
  return storyTitle.trim().replace(/\s+/g, '_').toLowerCase();
}

function splitPathFile(fullPath) {
  if (typeof fullPath !== 'string') {
    throw new Error('Not a valid path');
  }

  const filename = path.basename(fullPath);
  const middlePath = fullPath.slice(0, fullPath.indexOf(filename));

  return [middlePath, filename];
}

function normalizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new Error('Not a valid path');
  }

  return filename.toLowerCase().replace(/\s/g, '_');
}

/**
 * Generates a unique color based on a given string.
 * @param {string} str The input string.
 * @returns {string} A hex color code.
 */
function generateUniqueColor(str) {
  // Simple hash function to convert string to a numeric value
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert hash to RGB values
  const r = (hash >> 16) & 0xFF;
  const g = (hash >> 8) & 0xFF;
  const b = hash & 0xFF;

  return `rgba(${r},${g},${b},0.3)`;
}

module.exports = {
  titleToFilename,
  normalizeFilename,
  splitPathFile,
  generateUniqueColor,
}