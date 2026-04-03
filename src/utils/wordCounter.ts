/**
 * Word counting utility
 */

import * as fs from 'fs/promises';
import { Logger } from './logger';

const logger = new Logger('WordCounter');

export function countWords(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Trim and split on whitespace, filter empty strings
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  return words.length;
}

export function calculateWordDelta(previousCount: number, currentCount: number): number {
  return currentCount - previousCount;
}

/**
 * Count total words in multiple files
 * @param filePaths - Array of file paths to count
 * @returns Total word count across all files
 */
export async function countWordsInFiles(filePaths: string[]): Promise<number> {
  if (!filePaths || filePaths.length === 0) {
    return 0;
  }

  let totalWords = 0;

  try {
    const counts = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return countWords(content);
        } catch (error) {
          logger.warn(`Failed to read file for word count: ${filePath}`, error);
          return 0; // Skip unreadable files
        }
      })
    );

    totalWords = counts.reduce((sum, count) => sum + count, 0);
  } catch (error) {
    logger.error(`Error counting words in files: ${error}`);
    return 0;
  }

  return totalWords;
}
