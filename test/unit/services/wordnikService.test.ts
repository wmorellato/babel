import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { WordnikService, MissingApiKeyError } from '../../../src/services/wordnikService';

jest.mock('vscode');

describe('WordnikService', () => {
  let service: WordnikService;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { get: jest.fn() };
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
    mockConfig.get.mockImplementation((key: string) =>
      key === 'apiKey' ? 'test-key' : undefined
    );
    service = new WordnikService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getRandomWord returns the word from the API', async () => {
    (global.fetch as any) = (jest.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', word: 'serendipity' }),
    });

    const word = await service.getRandomWord();
    expect(word).toBe('serendipity');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/words.json/randomWord?api_key=test-key')
    );
  });

  it('getRandomWord throws MissingApiKeyError when key is empty', async () => {
    mockConfig.get.mockImplementation((key: string) =>
      key === 'apiKey' ? '' : undefined
    );
    await expect(service.getRandomWord()).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('getRandomWord throws on non-2xx response', async () => {
    (global.fetch as any) = (jest.fn() as any).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });
    await expect(service.getRandomWord()).rejects.toThrow('429');
  });

  it('getDefinitions maps text/partOfSpeech and filters empty text', async () => {
    (global.fetch as any) = (jest.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => [
        { partOfSpeech: 'noun', text: 'a def' },
        { partOfSpeech: 'verb', text: '' },
        { text: 'no pos' },
      ],
    });

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
    (global.fetch as any) = (jest.fn() as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    const defs = await service.getDefinitions('word', 3);
    expect(defs).toEqual([]);
  });
});
