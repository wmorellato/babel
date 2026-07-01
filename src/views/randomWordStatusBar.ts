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
    this.fetching = false;
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
