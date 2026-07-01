# Random Word Status Bar — Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan

## Summary

Add a status bar item that displays a random English word fetched from the
[Wordnik API](https://developer.wordnik.com/docs). Clicking the item fetches a
new word; hovering shows the word's definitions in the tooltip. On a fresh
VS Code session the item reads `Fetch word` until the first fetch. The current
word is held in memory only and is **not** persisted across sessions.

## Goals

- One-click random word discovery for writers, surfaced in the status bar.
- Definitions on hover, without leaving the editor.
- Zero new runtime dependencies; follow existing Babel status-bar conventions.

## Non-Goals

- Persisting the last word across sessions (explicitly out of scope).
- Word history, favorites, or copy-to-clipboard (YAGNI for v1).
- Random-word filters (part of speech, length, corpus) — use Wordnik defaults.

## User Experience

| State | Status bar text | Tooltip |
|-------|-----------------|---------|
| Fresh session (no fetch yet) | `$(book) Fetch word` | "Click to fetch a random word" |
| Fetching | `$(sync~spin) Fetching…` | (unchanged; clicks ignored) |
| Word loaded | `$(book) <word>` | Up to N definitions (default 3), each `partOfSpeech — text` |
| Word loaded, no definitions | `$(book) <word>` | "No definition found." |

- Alignment: **Left**, priority ~98 (consistent with other Babel status items).
- Resting codicon: `$(book)`.
- Click → runs command `babel.fetchRandomWord`.
- While a fetch is in flight, the item shows the spinner and ignores further
  clicks until it resolves (no overlapping requests).

## Error Handling

**Policy: toast only.** On a missing API key or any fetch failure (network
error, rate limit, non-2xx), the status bar text is left unchanged and a
VS Code notification (toast) explains the problem when a fetch is attempted:

- Missing key → "Set `babel.wordnik.apiKey` to use the random word feature."
- Network / HTTP error → a message including the failure reason.

## Architecture

Mirrors the existing pattern (`StoryStatusBar` / `DailyWordCountStatusBar` +
`initialize-*.ts`). Three small units, each independently testable:

### 1. `src/services/wordnikService.ts` — API client

Pure network client. No VS Code UI concerns beyond reading configuration.

```ts
interface Definition {
  partOfSpeech?: string;
  text: string;
}

class WordnikService {
  // Reads babel.wordnik.apiKey from configuration.
  getRandomWord(): Promise<string>;                     // GET .../v4/words.json/randomWord
  getDefinitions(word: string, limit: number): Promise<Definition[]>; // GET .../v4/word.json/{word}/definitions?limit=N
}
```

- Base URL: `https://api.wordnik.com/v4`.
- Uses native `fetch` (Node 18+, as in `dropboxTokenRefresher.ts`).
- Throws typed errors the caller can distinguish:
  - `MissingApiKeyError` (config empty)
  - generic `Error` with message for network / non-2xx responses.
- Response shapes:
  - `randomWord` → `{ id, word }` — extract `word`.
  - `definitions` → array of `{ text, partOfSpeech, ... }` — map to `Definition`.

### 2. `src/views/randomWordStatusBar.ts` — view

Owns the `vscode.StatusBarItem`. Holds the current word + definitions in memory.

- `createStatusBarItem(Left, 98)`, `command = 'babel.fetchRandomWord'`.
- Render methods for the four states in the UX table.
- `setLoading()`, `setWord(word, definitions)`, `showInitial()`.
- Tooltip built as a `vscode.MarkdownString` listing up to N definitions.
- Tracks an `isFetching` flag so the initializer can no-op overlapping clicks.
- `dispose()` disposes the item.

### 3. `src/extension/initialize-random-word.ts` — wiring

- Constructs `WordnikService` + `RandomWordStatusBar`.
- Registers command `babel.fetchRandomWord`:
  1. If already fetching, return.
  2. `setLoading()`.
  3. `word = await getRandomWord()`.
  4. `defs = await getDefinitions(word, definitionCount)`.
  5. `setWord(word, defs)`.
  6. On any thrown error: show toast, restore previous rendering.
- `definitionCount` read from `babel.wordnik.definitionCount` (default 3).
- Shows the item in its initial state.
- Returns a `Disposable` aggregating the command + status bar; called from
  `extension.ts` alongside the other `initialize*` calls.

## Configuration (package.json `contributes`)

- Command `babel.fetchRandomWord`, title `"Babel: Fetch Random Word"`.
- Settings:
  - `babel.wordnik.apiKey`: `string`, default `""`, description points to
    the Wordnik developer signup.
  - `babel.wordnik.definitionCount`: `number`, default `3`, minimum `1`,
    controls how many definitions the tooltip shows.

## Data Flow

```
click / command
   → initializer guards isFetching
   → view.setLoading()  ($(sync~spin) Fetching…)
   → WordnikService.getRandomWord()      ── config: babel.wordnik.apiKey
   → WordnikService.getDefinitions(word) ── config: babel.wordnik.definitionCount
   → view.setWord(word, defs)  ($(book) word, tooltip = markdown defs)
   (error at any step) → toast, view restored to prior state
```

## Testing

- **`wordnikService`** (`src/services/__tests__/`): mocked `fetch` —
  success path, missing key, network error, non-2xx status, empty definitions,
  correct URL/limit construction.
- **`randomWordStatusBar`** (`src/views/__tests__/`): mocked `StatusBarItem` —
  initial `Fetch word` render, loading render, word render, tooltip markdown
  formatting (0, 1, N definitions), `isFetching` guard behavior.

## Open Items

None. Codicon (`$(book)`) and left-alignment chosen as defaults; adjustable
before or during implementation.
