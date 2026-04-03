/**
 * Word counter utility tests
 */

import { countWords, calculateWordDelta, countWordsInFiles } from '../../../src/utils/wordCounter';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('wordCounter', () => {
  describe('countWords', () => {
    it('should count words in simple text', () => {
      expect(countWords('hello world')).toBe(2);
    });

    it('should count words separated by multiple spaces', () => {
      expect(countWords('hello    world')).toBe(2);
    });

    it('should count words separated by tabs and newlines', () => {
      expect(countWords('hello\t\nworld')).toBe(2);
    });

    it('should return 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('should return 0 for whitespace-only string', () => {
      expect(countWords('   \t\n  ')).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(countWords(null as any)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(countWords(undefined as any)).toBe(0);
    });

    it('should count words in a longer paragraph', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      expect(countWords(text)).toBe(9);
    });

    it('should handle punctuation as part of words', () => {
      expect(countWords('Hello, world!')).toBe(2);
    });

    it('should trim leading and trailing whitespace', () => {
      expect(countWords('  hello world  ')).toBe(2);
    });

    it('should count single word', () => {
      expect(countWords('hello')).toBe(1);
    });
  });

  describe('calculateWordDelta', () => {
    it('should calculate positive delta', () => {
      expect(calculateWordDelta(100, 150)).toBe(50);
    });

    it('should calculate negative delta', () => {
      expect(calculateWordDelta(100, 50)).toBe(-50);
    });

    it('should return 0 for no change', () => {
      expect(calculateWordDelta(100, 100)).toBe(0);
    });

    it('should handle zero starting count', () => {
      expect(calculateWordDelta(0, 100)).toBe(100);
    });
  });

  describe('countWordsInFiles', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 0 for empty array', async () => {
      const count = await countWordsInFiles([]);
      expect(count).toBe(0);
    });

    it('should count words from a single file', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('hello world');

      const count = await countWordsInFiles(['/path/to/file.md']);

      expect(count).toBe(2);
    });

    it('should sum word counts from multiple files', async () => {
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('hello world') // 2 words
        .mockResolvedValueOnce('foo bar baz'); // 3 words

      const count = await countWordsInFiles(['/path/file1.md', '/path/file2.md']);

      expect(count).toBe(5);
    });

    it('should handle missing file gracefully', async () => {
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('hello world') // 2 words
        .mockRejectedValueOnce(new Error('ENOENT: no such file')); // missing file
      // .mockResolvedValueOnce('foo bar'); // 2 words

      const count = await countWordsInFiles(['/path/file1.md', '/path/missing.md']);

      expect(count).toBe(2); // Only counts successful files
    });

    it('should return 0 if all files are missing', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      const count = await countWordsInFiles(['/path/missing1.md', '/path/missing2.md']);

      expect(count).toBe(0);
    });

    it('should handle empty files', async () => {
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('hello world') // 2 words
        .mockResolvedValueOnce('') // empty file
        .mockResolvedValueOnce('foo bar'); // 2 words

      const count = await countWordsInFiles(['/path/file1.md', '/path/empty.md', '/path/file3.md']);

      expect(count).toBe(4);
    });
  });
});
