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
