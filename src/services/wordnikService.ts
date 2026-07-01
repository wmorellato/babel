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
