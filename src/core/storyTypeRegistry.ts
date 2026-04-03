/**
 * Story Type Registry - Manages story types and boilerplate
 */

import { StoryType, StoryTypeDefinition } from '../types';

export type { StoryTypeDefinition } from '../types';

export class StoryTypeRegistry {
  private types: Map<StoryType, StoryTypeDefinition>;

  constructor() {
    this.types = new Map();
    this.registerDefaultTypes();
  }

  private registerDefaultTypes(): void {
    // Short Story
    this.registerType({
      type: StoryType.SHORT_STORY,
      displayName: 'Short Story',
      description: 'A complete story told briefly (2,000-7,500 words)',
      files: {
        'story.md': `# ${StoryType.SHORT_STORY}

## Story

*Write your short story here. A short story is a complete narrative
that can typically be read in one sitting.*

### Guidelines
- **Length**: 2,000-7,500 words
- **Structure**: Clear beginning, middle, and end
- **Focus**: Single plot or theme
- **Characters**: Limited cast, well-developed

### Tips
- Start with a compelling hook
- Use vivid, specific details
- Vary sentence length for rhythm
- Resolve conflicts naturally
`,
        'characters.md': `# Characters

## Main Characters

### Protagonist
- Name:
- Age/Description:
- Motivations:
- Arc:

### Supporting Characters
- (Add as needed)
`,
        'outline.md': `# Story Outline

## Story Structure

### Exposition
- Setting:
- Characters:
- Initial Situation:

### Rising Action
- Inciting Incident:
- Key Events:

### Climax
- The turning point:

### Falling Action
- Resolution begins:

### Resolution
- Final outcome:
`,
      },
    });

    // Novel
    this.registerType({
      type: StoryType.NOVEL,
      displayName: 'Novel',
      description: 'A full-length book (50,000+ words, multi-chapter structure)',
      files: {
        'story.md': `# Novel Draft

This is the main manuscript file. Write your novel here, or organize by chapters.

## Part One
[Chapters 1-?]

## Part Two
[Chapters ?-?]

## Part Three
[Chapters ?-?]
`,
        'characters.md': `# Characters

## Protagonist
- Name:
- Background:
- Goals:
- Conflicts:
- Arc:

## Antagonist
- Name:
- Background:
- Motivations:
- Relationship to protagonist:

## Supporting Characters
- (Add major and minor characters)

### Character Tracker
| Name | Role | Intro | Arc |
|------|------|-------|-----|
|      |      |       |     |
`,
        'outline.md': `# Novel Outline

## Three-Act Structure

### Act I: Setup
- Inciting Incident:
- Key Plot Points:
- End of Act I:

### Act II: Confrontation
- Subplot Complications:
- Midpoint:
- Rising Tensions:
- Dark Moment:

### Act III: Resolution
- Climax:
- Denouement:
- Final Scene:

## Subplots
- Subplot 1:
- Subplot 2:
- Subplot 3:

## Themes
- Primary Theme:
- Secondary Themes:
`,
        'chapter1.md': `# Chapter 1

## Title/Scene

*Begin your first chapter here.*

---
`,
      },
    });

    // Novella
    this.registerType({
      type: StoryType.NOVELLA,
      displayName: 'Novella',
      description: 'A medium-length work (20,000-50,000 words, few chapters)',
      files: {
        'story.md': `# Novella

A novella is longer than a short story but shorter than a novel.

## Writing Notes
- Typically 20,000-50,000 words
- Few characters, focused plot
- Can be read in a few sittings
`,
        'characters.md': `# Characters

## Main Characters

### Protagonist
- Name:
- Background:
- Goal:
- Arc:

### Key Supporting Characters
- (Keep cast lean for novella length)
`,
        'outline.md': `# Story Structure

## Plot Overview
- Opening:
- Inciting Incident:
- Development:
- Climax:
- Resolution:

## Themes
- Primary:
- Secondary:
`,
        'chapter1.md': `# Chapter 1

*Begin your first chapter here.*

---
`,
      },
    });

    // Essay
    this.registerType({
      type: StoryType.ESSAY,
      displayName: 'Essay',
      description: 'A non-fiction piece exploring ideas (1,000-10,000+ words)',
      files: {
        'story.md': `# Essay Title

## Introduction
- Hook:
- Thesis:
- Scope:

## Body Sections

### Section 1
[Develop your first main point]

### Section 2
[Develop your second main point]

### Section 3
[Develop your third main point]

## Conclusion
- Summary:
- Final thoughts:
- Call to action (if applicable):
`,
        'outline.md': `# Essay Outline

## Main Points
1. Point 1:
   - Evidence:
   - Examples:

2. Point 2:
   - Evidence:
   - Examples:

3. Point 3:
   - Evidence:
   - Examples:

## Sources/References
- (Add citations as needed)
`,
      },
    });
  }

  registerType(definition: StoryTypeDefinition): void {
    this.types.set(definition.type, definition);
  }

  getType(type: StoryType): StoryTypeDefinition | undefined {
    return this.types.get(type);
  }

  getAllTypes(): StoryTypeDefinition[] {
    return Array.from(this.types.values());
  }

  getFiles(type: StoryType): Record<string, string> | undefined {
    const definition = this.getType(type);
    return definition?.files;
  }

  getDisplayName(type: StoryType): string | undefined {
    return this.getType(type)?.displayName;
  }
}
