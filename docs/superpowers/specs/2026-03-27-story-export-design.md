# Story Export to DOCX Design Specification

**Date:** 2026-03-27
**Feature:** One-click export of stories to DOCX format with Shunn's manuscript formatting
**Use Cases:** Publisher/agent submissions, sharing with beta readers, professional distribution

---

## Overview

Enable writers to export Babel stories to DOCX format with a single command. The export uses a pre-built Shunn-compliant template (`resources/templates/short_story.dotx`) with field replacement, supporting both single-file and multi-chapter story structures.

**In Scope:** DOCX export only (EPUB and Kindle exports deferred to future phases)

---

## Architecture

### Component Structure

**ExportService** (orchestrator)
- Entry point for export workflow
- Coordinates StoryAssembler → TemplatePopulator → file write
- Handles error catching and user notifications

**StoryAssembler**
- Detects story structure (single file vs. multi-chapter)
- Gathers content in correct order
- Returns: `{ content: string, metadata: StoryMetadata }`

**TemplatePopulator**
- Loads `.dotx` template from `resources/templates/short_story.dotx`
- Replaces template fields with story data and metadata
- Uses `docx` npm library's template API
- Returns: DOCX buffer ready to write to disk

**ExportCommand** (VSCode command handler)
- Registered as `babel.exportStory` in Command Palette
- Gets current story from active editor
- Prompts user for save location (VSCode file dialog)
- Calls ExportService and shows success/error notification

---

## Data Flow

### Metadata Sources

| Field | Source |
|-------|--------|
| `{{author_name}}` | VSCode setting `babel.authorName` |
| `{{author_byline}}` | VSCode setting `babel.authorByline` |
| `{{word_count}}` | `storyRepository.findById(storyId).currentWordCount` |
| `{{address}}` | VSCode setting `babel.address` |
| `{{city_postcode}}` | VSCode setting `babel.cityPostcode` |
| `{{phone}}` | VSCode setting `babel.phone` |
| `{{email}}` | VSCode setting `babel.email` |
| `{{story_title}}` | `storyRepository.findById(storyId).displayName` |
| `{{story_content}}` | Assembled from story files (single or multi-chapter) |
| `{{author_surname}}` | Derived from `babel.authorName` (last word) |
| `{{title_keyword}}` | Derived from story title (first 2-3 words) |

### Story Content Assembly

**Single-file stories:**
- Read entire file as content

**Multi-chapter stories:**
- Detect by filename pattern: `chapter-*.md`, `*.chapter.md`, or numeric prefix (`01-`, `02-`)
- Sort alphabetically or numerically
- Join chapters with optional section breaks (paragraph separator)
- Return concatenated content

---

## Template & Field Replacement

### Template Location
`resources/templates/short_story.dotx` — pre-formatted Shunn manuscript template

### Field Replacement Method
Uses `docx` npm library's template engine:
- Load template with `createDocumentAndUpdateFields()` or template API
- Map metadata to template variable names
- Generate DOCX buffer

### Template Fields

**Document body:**
- `{{author_name}}` - Full author name
- `{{author_byline}}` - Author biography/byline
- `{{word_count}}` - Story word count
- `{{address}}` - Author mailing address
- `{{city_postcode}}` - City and postal code
- `{{phone}}` - Author phone number
- `{{email}}` - Author email address
- `{{story_title}}` - Story title
- `{{story_content}}` - Full story text

**Document header:**
- `{{author_surname}}` - Author's surname (for running header)
- `{{title_keyword}}` - Story title keyword(s) (for running header)

---

## Error Handling

### User-Facing Errors

| Scenario | Error Message | Recovery |
|----------|---------------|----------|
| No active editor | "No story selected. Open a story file and try again." | Close dialog |
| Story not found in DB | "Story not found. Please open a valid story file." | Close dialog |
| Template file missing | "Export template not found. Please reinstall Babel." | Check installation |
| File write failed | "Failed to save DOCX: [error details]" | Retry or choose different location |
| User cancels save dialog | (silent exit) | — |

### Silent Fallbacks

- Missing metadata fields (author name, email) → populate with placeholder text or empty string
- Template field not found in `.dotx` → skip silently (docx library behavior)
- Word count is 0 → export anyway with `0` as count

### Chapter Detection Edge Cases

| Case | Behavior |
|------|----------|
| Empty story directory | Error: "No content files found" |
| Mixed single file + chapters | Prefer `chapter-*.md` if present; ignore other `.md` files |
| Chapters out of order | Sort alphabetically/numerically by filename |
| Non-markdown files in directory | Ignore |

---

## Component Interfaces

### StoryAssembler

```typescript
interface StoryMetadata {
  storyId: string;
  storyTitle: string;
  wordCount: number;
  authorName: string;
  authorByline: string;
  address: string;
  cityPostcode: string;
  phone: string;
  email: string;
  authorSurname: string;      // Derived
  titleKeyword: string;        // Derived
}

class StoryAssembler {
  assemble(storyPath: string): { content: string; metadata: StoryMetadata }
  private detectStructure(storyPath: string): 'single' | 'chapters'
  private readSingleFile(storyPath: string): string
  private readChapters(storyPath: string): string
  private deriveAuthorSurname(fullName: string): string
  private deriveTitleKeyword(title: string): string
}
```

### TemplatePopulator

```typescript
class TemplatePopulator {
  async populate(content: string, metadata: StoryMetadata): Promise<Buffer>
  private loadTemplate(): Promise<Document>
  private replaceFields(doc: Document, fields: Record<string, string>): Document
}
```

### ExportService

```typescript
interface ExportResult {
  success: boolean;
  message: string;
  filePath?: string;
}

class ExportService {
  async exportStory(storyId: string, savePath: string): Promise<ExportResult>
  private getStoryPath(storyId: string): string
}
```

### ExportCommand

```typescript
class ExportCommand {
  async execute(): Promise<CommandResult>
  static register(context: vscode.ExtensionContext): void
}
```

---

## Testing Strategy

### Unit Tests

**StoryAssembler:**
- ✓ Single-file detection and read
- ✓ Multi-chapter detection (various naming patterns)
- ✓ Chapter ordering (numeric and alphabetic)
- ✓ Empty directory error
- ✓ Author surname derivation (various name formats)
- ✓ Title keyword derivation (various title lengths)

**TemplatePopulator:**
- ✓ Field replacement (all template fields)
- ✓ Missing template file error
- ✓ Generated DOCX contains replaced values

**ExportService:**
- ✓ Successful export flow
- ✓ Story not found error
- ✓ File write error handling

**ExportCommand:**
- ✓ No active editor error
- ✓ Story ID extraction from file path
- ✓ Command registration

### Integration Tests

- ✓ End-to-end: create test story → export → verify DOCX structure and content
- ✓ Multi-chapter export: verify chapters joined correctly
- ✓ Missing metadata: verify export completes with placeholders

### Manual Testing

- [ ] Single-file story export to DOCX
- [ ] Multi-chapter story export to DOCX
- [ ] Various author name formats in running header
- [ ] Word count accuracy in exported document
- [ ] Shunn formatting preserved in template
- [ ] Missing optional metadata fields handled gracefully

---

## Implementation Phases

### Phase 1: Core Export Service
- Create StoryAssembler with single/multi-chapter support
- Create TemplatePopulator with docx library integration
- Create ExportService orchestrator
- Unit tests for all components

### Phase 2: VSCode Integration
- Create ExportCommand
- Register command in Command Palette
- Wire into extension activation
- User notifications (success/error)

### Phase 3: Testing & Validation
- Integration tests
- Manual testing across story types
- Error handling verification

---

## Dependencies

**New npm packages:**
- `docx` — for DOCX generation and template population

**Existing dependencies:**
- `vscode` — command registration, file dialogs, notifications
- `storyRepository` — fetch story metadata
- `BabelSettings` — read author metadata from settings

---

## Settings Required

Users must configure these settings for full metadata in exports:

```json
{
  "babel.authorName": "string",      // e.g., "Jane Doe"
  "babel.authorByline": "string",    // e.g., "Jane is a novelist from..."
  "babel.address": "string",         // e.g., "123 Main St"
  "babel.cityPostcode": "string",    // e.g., "Portland, OR 97201"
  "babel.phone": "string",           // e.g., "+1-555-0123"
  "babel.email": "string"            // e.g., "jane@example.com"
}
```

Exports will complete even if these are unset (using empty strings or placeholders).

---

## Future Phases (Out of Scope)

- EPUB export (requires different template/library)
- Kindle Direct Publishing integration
- Custom template selection
- Cover image embedding
- PDF export
- Advanced formatting options (fonts, colors, etc.)

---

## Success Criteria

- ✓ One-click export via Command Palette
- ✓ Single-file and multi-chapter stories export correctly
- ✓ All template fields populated with story data
- ✓ Shunn formatting preserved from template
- ✓ Error handling covers all failure cases
- ✓ Author metadata comes from settings
- ✓ 80%+ test coverage
- ✓ No TypeScript errors
