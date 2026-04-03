import { storyTypeDetector } from '../../../src/utils/storyTypeDetector'
import { StoryType } from '../../../src/types'

describe('storyTypeDetector', () => {
  describe('detectType', () => {
    it('should return SHORT_STORY for < 10000 words', () => {
      expect(storyTypeDetector.detectType(1000)).toBe(StoryType.SHORT_STORY)
      expect(storyTypeDetector.detectType(9999)).toBe(StoryType.SHORT_STORY)
    })

    it('should return NOVELLA for 10000-50000 words', () => {
      expect(storyTypeDetector.detectType(10000)).toBe(StoryType.NOVELLA)
      expect(storyTypeDetector.detectType(25000)).toBe(StoryType.NOVELLA)
      expect(storyTypeDetector.detectType(50000)).toBe(StoryType.NOVELLA)
    })

    it('should return NOVEL for > 50000 words', () => {
      expect(storyTypeDetector.detectType(50001)).toBe(StoryType.NOVEL)
      expect(storyTypeDetector.detectType(100000)).toBe(StoryType.NOVEL)
    })

    it('should handle 0 words as SHORT_STORY', () => {
      expect(storyTypeDetector.detectType(0)).toBe(StoryType.SHORT_STORY)
    })

    it('should handle negative words as SHORT_STORY', () => {
      expect(storyTypeDetector.detectType(-100)).toBe(StoryType.SHORT_STORY)
    })
  })
})
