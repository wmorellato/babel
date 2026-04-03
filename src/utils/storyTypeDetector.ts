import { StoryType } from '../types'

export const storyTypeDetector = {
  /**
   * Detect story type from word count
   * - SHORT_STORY: < 10,000 words
   * - NOVELLA: 10,000 - 50,000 words
   * - NOVEL: > 50,000 words
   */
  detectType(wordCount: number): StoryType {
    const count = Math.max(0, wordCount) // Handle negative counts

    if (count < 10000) {
      return StoryType.SHORT_STORY
    } else if (count <= 50000) {
      return StoryType.NOVELLA
    } else {
      return StoryType.NOVEL
    }
  },
}
