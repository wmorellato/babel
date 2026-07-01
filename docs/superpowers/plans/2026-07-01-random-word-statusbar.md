# Random Word Status Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a status bar item that fetches a random word from Wordnik on click and shows its definitions on hover.

**Architecture:** A thin `WordnikService` (native `fetch` API client) + a `RandomWordStatusBar` view that owns the `StatusBarItem` + an `initialize-random-word.ts` initializer that wires them and registers the `babel.fetchRandomWord` command. Mirrors the existing `StoryStatusBar` / `initialize-*.ts` pattern. The current word lives in memory only (resets each session).

**Tech Stack:** TypeScript, VS Code Extension API, native `fetch` (Node 18+), Jest + ts-jest.

## Global Constraints

- Node `>=18.0.0` — use the global `fetch`; do **not** add an HTTP dependency (matches `src/services/dropboxTokenRefresher.ts`).
- No `console.log` in `src/` — use the `Logger` from `src/utils/logger.ts`.
- Tests live under `test/unit/...`, use `jest.mock('vscode')`, and import source via relative paths (e.g. `../../../src/...`).
- Immutability: never mutate inputs; build new objects.
- Config namespace: `babel.wordnik`. Keys: `apiKey` (string, default `""`), `definitionCount` (number, default `3`, min `1`).
- Command id: `babel.fetchRandomWord`. Status bar: `Left`, priority `98`, resting codicon `$(book)`.
- Error policy: **toast only** — on failure the status bar reverts to its prior state and a `showErrorMessage` toast is shown.
- Run a single test file with: `npx jest <path> --maxWorkers=1`. Type-check with: `npx tsc --noEmit`.

---

### Task 1: Extend the vscode test mock

The mock at `test/__mocks__/vscode.ts` lacks `MarkdownString` (used for tooltips) and a `tooltip` field on the status bar item. Add them so later view tests can run.

**Files:**
- Modify: `test/__mocks__/vscode.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `vscode.MarkdownString` runtime class with `{ value: string; appendMarkdown(v: string): MarkdownString }`; `StatusBarItem.tooltip?: string | MarkdownString`.

- [ ] **Step 1: Add `tooltip` to the `StatusBarItem` interface**

In `test/__mocks__/vscode.ts`, replace the `StatusBarItem` interface (currently lines ~112-117):

```ts
export interface StatusBarItem extends Disposable {
  text: string;
  command?: string;
  tooltip?: string | MarkdownString;
  show(): void;
  hide(): void;
}
```

- [ ] **Step 2: Add `tooltip` to the object returned by `createStatusBarItem`**

In the `window.createStatusBarItem` mock (currently lines ~156-164), add `tooltip`:

```ts
  createStatusBarItem: (alignment?: StatusBarAlignment, priority?: number): StatusBarItem => {
    return {
      text: '',
      command: undefined,
      tooltip: undefined,
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    };
  },
```

- [ ] **Step 3: Add a `MarkdownString` class**

Add near the `ThemeIcon` class (after `ThemeColor`/`ThemeIcon`, before `EventEmitter`):

```ts
export class MarkdownString {
  value: string;

  constructor(value?: string) {
    this.value = value ?? '';
  }

  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}
```

- [ ] **Step 4: Verify the existing suite still passes**

Run: `npx jest test/unit/views --maxWorkers=1`
Expected: PASS (no regressions from the mock change).

- [ ] **Step 5: Commit**

```bash
git add test/__mocks__/vscode.ts
git commit -m "test: add MarkdownString and status bar tooltip to vscode mock"
```

---

### Task 2: WordnikService (API client) + settings contribution

**Files:**
- Create: `src/services/wordnikService.ts`
- Create: `test/unit/services/wordnikService.test.ts`
- Modify: `package.json` (add `babel.wordnik.*` settings under `contributes.configuration.properties`)

**Interfaces:**
- Consumes: `vscode.workspace.getConfiguration('babel.wordnik')`, global `fetch`.
- Produces:
  - `interface Definition { partOfSpeech?: string; text: string }`
  - `class MissingApiKeyError extends Error`
  - `class WordnikService { getRandomWord(): Promise<string>; getDefinitions(word: string, limit: number): Promise<Definition[]> }`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/services/wordnikService.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { WordnikService, MissingApiKeyError } from '../../../src/services/wordnikService';

jest.mock('vscode');

describe('WordnikService', () => {
  let service: WordnikService;
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { get: jest.fn() };
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
    mockConfig.get.mockImplementation((key: string, def?: unknown) =>
      key === 'apiKey' ? 'test-key' : def
    );
    service = new WordnikService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getRandomWord returns the word from the API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', word: 'serendipity' }),
    }) as unknown as typeof fetch;

    const word = await service.getRandomWord();
    expect(word).toBe('serendipity');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/words.json/randomWord?api_key=test-key')
    );
  });

  it('getRandomWord throws MissingApiKeyError when key is empty', async () => {
    mockConfig.get.mockImplementation((key: string, def?: unknown) =>
      key === 'apiKey' ? '' : def
    );
    await expect(service.getRandomWord()).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('getRandomWord throws on non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }) as unknown as typeof fetch;
    await expect(service.getRandomWord()).rejects.toThrow('429');
  });

  it('getDefinitions maps text/partOfSpeech and filters empty text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { partOfSpeech: 'noun', text: 'a def' },
        { partOfSpeech: 'verb', text: '' },
        { text: 'no pos' },
      ],
    }) as unknown as typeof fetch;

    const defs = await service.getDefinitions('word', 3);
    expect(defs).toEqual([
      { partOfSpeech: 'noun', text: 'a def' },
      { partOfSpeech: undefined, text: 'no pos' },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/word.json/word/definitions?limit=3')
    );
  });

  it('getDefinitions returns an empty array when the API returns none', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;
    const defs = await service.getDefinitions('word', 3);
    expect(defs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/unit/services/wordnikService.test.ts --maxWorkers=1`
Expected: FAIL — `Cannot find module '../../../src/services/wordnikService'`.

- [ ] **Step 3: Implement the service**

Create `src/services/wordnikService.ts`:

```ts
/**
 * Wordnik API client
 * Fetches random words and their definitions from https://developer.wordnik.com
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

const logger = new Logger('WordnikService');
const BASE_URL = 'https://api.wordnik.com/v4';

export interface Definition {
  partOfSpeech?: string;
  text: string;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('Wordnik API key not configured');
    this.name = 'MissingApiKeyError';
  }
}

export class WordnikService {
  private getApiKey(): string {
    const key = vscode.workspace.getConfiguration('babel.wordnik').get<string>('apiKey', '');
    if (!key) {
      throw new MissingApiKeyError();
    }
    return key;
  }

  async getRandomWord(): Promise<string> {
    const apiKey = this.getApiKey();
    const url = `${BASE_URL}/words.json/randomWord?api_key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Wordnik randomWord failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { word?: string };
    if (!data.word) {
      throw new Error('Wordnik randomWord returned no word');
    }

    logger.debug(`Fetched random word: ${data.word}`);
    return data.word;
  }

  async getDefinitions(word: string, limit: number): Promise<Definition[]> {
    const apiKey = this.getApiKey();
    const url =
      `${BASE_URL}/word.json/${encodeURIComponent(word)}/definitions` +
      `?limit=${limit}&api_key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Wordnik definitions failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Array<{ text?: string; partOfSpeech?: string }>;
    return data
      .filter((d): d is { text: string; partOfSpeech?: string } => typeof d.text === 'string' && d.text.length > 0)
      .map((d) => ({ partOfSpeech: d.partOfSpeech, text: d.text }));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest test/unit/services/wordnikService.test.ts --maxWorkers=1`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the settings contribution to package.json**

In `package.json`, inside `contributes.configuration.properties` (the object that begins at the `"babel.backup.enabled"` entry, ~line 368), add these two properties (e.g. right after the opening `"properties": {`):

```json
                "babel.wordnik.apiKey": {
                    "type": "string",
                    "default": "",
                    "markdownDescription": "API key for [Wordnik](https://developer.wordnik.com/) used by the random word status bar item."
                },
                "babel.wordnik.definitionCount": {
                    "type": "number",
                    "default": 3,
                    "minimum": 1,
                    "description": "Number of definitions shown in the random word tooltip."
                },
```

- [ ] **Step 6: Verify package.json is valid JSON**

Run: `node -e "require('./package.json'); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 7: Commit**

```bash
git add src/services/wordnikService.ts test/unit/services/wordnikService.test.ts package.json
git commit -m "feat: add WordnikService and babel.wordnik settings"
```

---

### Task 3: RandomWordStatusBar (view)

**Files:**
- Create: `src/views/randomWordStatusBar.ts`
- Create: `test/unit/views/randomWordStatusBar.test.ts`

**Interfaces:**
- Consumes: `Definition` from `src/services/wordnikService.ts`; `vscode.window.createStatusBarItem`, `vscode.MarkdownString`.
- Produces: `class RandomWordStatusBar` with:
  - `get isFetching(): boolean`
  - `showInitial(): void`
  - `setLoading(): void`
  - `setWord(word: string, definitions: Definition[]): void`
  - `restorePrevious(): void`
  - `dispose(): void`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/views/randomWordStatusBar.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RandomWordStatusBar } from '../../../src/views/randomWordStatusBar';

jest.mock('vscode');

function itemOf(bar: RandomWordStatusBar): { text: string; command?: string; tooltip: { value: string } } {
  // Access the private status bar item for assertions.
  return (bar as unknown as { statusBarItem: { text: string; command?: string; tooltip: { value: string } } })
    .statusBarItem;
}

describe('RandomWordStatusBar', () => {
  let bar: RandomWordStatusBar;

  beforeEach(() => {
    jest.clearAllMocks();
    bar = new RandomWordStatusBar();
  });

  it('shows "Fetch word" initially', () => {
    expect(itemOf(bar).text).toBe('$(book) Fetch word');
  });

  it('binds the command to babel.fetchRandomWord', () => {
    expect(itemOf(bar).command).toBe('babel.fetchRandomWord');
  });

  it('setLoading shows the spinner and sets isFetching', () => {
    bar.setLoading();
    expect(bar.isFetching).toBe(true);
    expect(itemOf(bar).text).toBe('$(sync~spin) Fetching…');
  });

  it('setWord renders the word, its definitions, and clears isFetching', () => {
    bar.setLoading();
    bar.setWord('serendipity', [{ partOfSpeech: 'noun', text: 'good luck' }]);
    expect(bar.isFetching).toBe(false);
    expect(itemOf(bar).text).toBe('$(book) serendipity');
    expect(itemOf(bar).tooltip.value).toContain('serendipity');
    expect(itemOf(bar).tooltip.value).toContain('good luck');
    expect(itemOf(bar).tooltip.value).toContain('noun');
  });

  it('tooltip says "No definition found" when there are no definitions', () => {
    bar.setWord('word', []);
    expect(itemOf(bar).tooltip.value).toContain('No definition found');
  });

  it('restorePrevious reverts to the word shown before loading', () => {
    bar.setWord('alpha', [{ text: 'first' }]);
    bar.setLoading();
    expect(itemOf(bar).text).toBe('$(sync~spin) Fetching…');
    bar.restorePrevious();
    expect(bar.isFetching).toBe(false);
    expect(itemOf(bar).text).toBe('$(book) alpha');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest test/unit/views/randomWordStatusBar.test.ts --maxWorkers=1`
Expected: FAIL — `Cannot find module '../../../src/views/randomWordStatusBar'`.

- [ ] **Step 3: Implement the view**

Create `src/views/randomWordStatusBar.ts`:

```ts
/**
 * Random Word Status Bar Item
 * Shows the last fetched Wordnik word; definitions appear on hover.
 */

import * as vscode from 'vscode';
import { Definition } from '../services/wordnikService';

const INITIAL_TEXT = '$(book) Fetch word';
const LOADING_TEXT = '$(sync~spin) Fetching…';
const INITIAL_TOOLTIP = 'Click to fetch a random word';

export class RandomWordStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private fetching = false;
  private previousText = INITIAL_TEXT;
  private previousTooltip: string | vscode.MarkdownString = INITIAL_TOOLTIP;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.statusBarItem.command = 'babel.fetchRandomWord';
    this.showInitial();
    this.statusBarItem.show();
  }

  get isFetching(): boolean {
    return this.fetching;
  }

  showInitial(): void {
    this.statusBarItem.text = INITIAL_TEXT;
    this.statusBarItem.tooltip = INITIAL_TOOLTIP;
  }

  setLoading(): void {
    this.previousText = this.statusBarItem.text;
    this.previousTooltip = this.statusBarItem.tooltip ?? INITIAL_TOOLTIP;
    this.fetching = true;
    this.statusBarItem.text = LOADING_TEXT;
  }

  setWord(word: string, definitions: Definition[]): void {
    this.fetching = false;
    this.statusBarItem.text = `$(book) ${word}`;
    this.statusBarItem.tooltip = this.buildTooltip(word, definitions);
  }

  restorePrevious(): void {
    this.fetching = false;
    this.statusBarItem.text = this.previousText;
    this.statusBarItem.tooltip = this.previousTooltip;
  }

  private buildTooltip(word: string, definitions: Definition[]): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${word}**\n\n`);

    if (definitions.length === 0) {
      md.appendMarkdown('_No definition found._');
      return md;
    }

    for (const def of definitions) {
      const pos = def.partOfSpeech ? `*${def.partOfSpeech}* — ` : '';
      md.appendMarkdown(`- ${pos}${def.text}\n`);
    }

    return md;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest test/unit/views/randomWordStatusBar.test.ts --maxWorkers=1`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/randomWordStatusBar.ts test/unit/views/randomWordStatusBar.test.ts
git commit -m "feat: add RandomWordStatusBar view"
```

---

### Task 4: Initializer + command contribution + extension wiring

Wire the service and view together behind the `babel.fetchRandomWord` command and register it in `extension.ts`. This initializer follows the untested `initialize-*.ts` convention (no dedicated unit test), so verification is type-check + build + full suite.

**Files:**
- Create: `src/extension/initialize-random-word.ts`
- Modify: `package.json` (add `babel.fetchRandomWord` to `contributes.commands`)
- Modify: `src/extension.ts` (import, call, add to `featureDisposables`)

**Interfaces:**
- Consumes: `ExtensionDependencies` from `src/extension/types.ts`; `WordnikService`, `MissingApiKeyError` from `src/services/wordnikService.ts`; `RandomWordStatusBar` from `src/views/randomWordStatusBar.ts`.
- Produces: `initializeRandomWord(deps: ExtensionDependencies): vscode.Disposable`.

- [ ] **Step 1: Create the initializer**

Create `src/extension/initialize-random-word.ts`:

```ts
import * as vscode from 'vscode';
import { WordnikService, MissingApiKeyError } from '../services/wordnikService';
import { RandomWordStatusBar } from '../views/randomWordStatusBar';
import { ExtensionDependencies } from './types';

const DEFAULT_DEFINITION_COUNT = 3;

/**
 * Initialize the random word status bar feature.
 * Registers the babel.fetchRandomWord command and the status bar item.
 */
export function initializeRandomWord(deps: ExtensionDependencies): vscode.Disposable {
  const { logger } = deps;
  const service = new WordnikService();
  const statusBar = new RandomWordStatusBar();

  const fetchWord = async (): Promise<void> => {
    if (statusBar.isFetching) {
      return;
    }

    statusBar.setLoading();

    try {
      const word = await service.getRandomWord();
      const limit = vscode.workspace
        .getConfiguration('babel.wordnik')
        .get<number>('definitionCount', DEFAULT_DEFINITION_COUNT);
      const definitions = await service.getDefinitions(word, limit);
      statusBar.setWord(word, definitions);
    } catch (error) {
      statusBar.restorePrevious();
      const message =
        error instanceof MissingApiKeyError
          ? 'Set babel.wordnik.apiKey to use the random word feature.'
          : `Failed to fetch random word: ${error instanceof Error ? error.message : String(error)}`;
      void vscode.window.showErrorMessage(message);
      logger.warn(message);
    }
  };

  const commandDisposable = vscode.commands.registerCommand('babel.fetchRandomWord', fetchWord);

  logger.info('Random word feature initialized');

  return vscode.Disposable.from(commandDisposable, statusBar);
}
```

- [ ] **Step 2: Add the command to package.json**

In `package.json`, inside `contributes.commands` (the array starting ~line 67), add this entry right after the `babel.newStory` object (which ends at its closing `},`):

```json
            {
                "command": "babel.fetchRandomWord",
                "title": "Babel: Fetch Random Word",
                "icon": "$(book)"
            },
```

- [ ] **Step 3: Import the initializer in extension.ts**

In `src/extension.ts`, add after the existing `initializeReveal` import (line ~26):

```ts
import { initializeRandomWord } from './extension/initialize-random-word';
```

- [ ] **Step 4: Call the initializer**

In `src/extension.ts`, in the `activate` function after `const revealDisposable = await initializeReveal(deps);` (line ~164), add:

```ts
    const randomWordDisposable = initializeRandomWord(deps);
```

- [ ] **Step 5: Register the disposable for cleanup**

In `src/extension.ts`, in the `featureDisposables` array (around lines ~180-190), add `randomWordDisposable,` after `revealDisposable,`:

```ts
    const featureDisposables = [
      treeProviderDisposable,
      statusBarDisposable,
      colorDisposable,
      autoCommitDisposable,
      wordCountDisposable,
      revealDisposable,
      randomWordDisposable,
      commandDisposable,
      backupDisposable,
      hoverDisposable,
    ];
```

- [ ] **Step 6: Type-check the project**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Build the bundle**

Run: `npm run compile`
Expected: builds `dist/extension.js` with no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS, including the new `wordnikService` and `randomWordStatusBar` suites; coverage thresholds still met.

- [ ] **Step 9: Commit**

```bash
git add src/extension/initialize-random-word.ts src/extension.ts package.json
git commit -m "feat: wire random word status bar into the extension"
```

---

## Manual verification (after Task 4)

1. Get a free API key at https://developer.wordnik.com/.
2. Set `babel.wordnik.apiKey` in VS Code settings.
3. Launch the Extension Development Host (F5).
4. Confirm the status bar shows `$(book) Fetch word`.
5. Click it → spinner → a random word appears.
6. Hover → tooltip lists up to 3 definitions.
7. Clear the API key and click → status bar reverts, a toast asks you to set the key.
```
