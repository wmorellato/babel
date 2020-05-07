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

module.exports = {
  titleToFilename,
  normalizeFilename,
  splitPathFile,
}