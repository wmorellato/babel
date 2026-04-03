/**
 * Mock VSCode module for unit testing
 */

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export class Uri {
  static parse(path: string): Uri {
    return new Uri(path);
  }

  static file(path: string): Uri {
    return new Uri(`file://${path}`);
  }

  constructor(public fsPath: string) {}

  toString(): string {
    return this.fsPath;
  }
}

export interface Disposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export interface ExtensionContext {
  globalStoragePath: string;
  subscriptions: Disposable[];
}

export class WorkspaceConfiguration {
  private config: Record<string, any> = {};

  get<T>(section: string, defaultValue?: T): T {
    return this.config[section] ?? defaultValue;
  }

  update(section: string, value: any): Promise<void> {
    this.config[section] = value;
    return Promise.resolve();
  }
}

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: jest.fn((section?: string): WorkspaceConfiguration => {
    return new WorkspaceConfiguration();
  }),
  onDidChangeConfiguration: jest.fn((listener: (e: any) => any): Disposable => {
    return {
      dispose: () => {},
    };
  }),
  onDidSaveTextDocument: jest.fn((handler: (document: any) => any): Disposable => {
    return { dispose: jest.fn() };
  }),
  onDidChangeTextDocument: jest.fn((handler: (event: any) => any): Disposable => {
    return { dispose: jest.fn() };
  }),
};

export enum StatusBarAlignment {
  Left = 0,
  Right = 1,
}

export interface QuickPickItem {
  label: string;
  description?: string;
  picked?: boolean;
  alwaysShow?: boolean;
}

export interface InputBoxOptions {
  title?: string;
  prompt?: string;
  value?: string;
  valueSelection?: [number, number];
  placeHolder?: string;
  password?: boolean;
  ignoreFocusOut?: boolean;
  validateInput?: (value: string) => string | null;
}

export interface OpenDialogOptions {
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  defaultUri?: Uri;
  title?: string;
  filters?: Record<string, string[]>;
  openLabel?: string;
}

export interface SaveDialogOptions {
  defaultUri?: Uri;
  title?: string;
  filters?: Record<string, string[]>;
  saveLabel?: string;
}

export interface StatusBarItem extends Disposable {
  text: string;
  command?: string;
  show(): void;
  hide(): void;
}

export interface OutputChannel extends Disposable {
  name: string;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
}

export const window = {
  showInformationMessage: jest.fn((message: string, ...items: string[]): Promise<string | undefined> => {
    console.log(message);
    return Promise.resolve(undefined);
  }),
  showErrorMessage: jest.fn((message: string, ...items: string[]): Promise<string | undefined> => {
    console.error(message);
    return Promise.resolve(undefined);
  }),
  showWarningMessage: jest.fn((message: string, ...items: string[]): Promise<string | undefined> => {
    console.warn(message);
    return Promise.resolve(undefined);
  }),
  showQuickPick: jest.fn((items: QuickPickItem[], options?: any): Promise<QuickPickItem | undefined> => {
    return Promise.resolve(undefined);
  }),
  showInputBox: jest.fn((options?: InputBoxOptions): Promise<string | undefined> => {
    return Promise.resolve(undefined);
  }),
  showSaveDialog: jest.fn((options?: SaveDialogOptions): Promise<Uri | undefined> => {
    return Promise.resolve(undefined);
  }),
  showOpenDialog: jest.fn((options?: OpenDialogOptions): Promise<Uri[] | undefined> => {
    return Promise.resolve(undefined);
  }),
  showTextDocument: jest.fn((uri: Uri): Promise<any> => {
    return Promise.resolve(undefined);
  }),
  createStatusBarItem: (alignment?: StatusBarAlignment, priority?: number): StatusBarItem => {
    return {
      text: '',
      command: undefined,
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    };
  },
  createOutputChannel: jest.fn((name: string): OutputChannel => {
    return {
      name,
      append: jest.fn(),
      appendLine: jest.fn(),
      clear: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    };
  }),
  onDidChangeActiveTextEditor: jest.fn((handler: (editor: any) => any): Disposable => {
    return { dispose: jest.fn() };
  }),
};

export const commands = {
  registerCommand: (command: string, callback: (...args: any[]) => any): Disposable => {
    return { dispose: () => {} };
  },
};

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class EventEmitter<T> {
  private listeners: ((e: T) => any)[] = [];

  get event(): (listener: (e: T) => any) => Disposable {
    return (listener: (e: T) => any) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const idx = this.listeners.indexOf(listener);
          if (idx !== -1) this.listeners.splice(idx, 1);
        },
      };
    };
  }

  fire(data: T): void {
    this.listeners.forEach((listener) => listener(data));
  }
}
