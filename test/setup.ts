/**
 * Jest setup file - configure mocks and globals
 */

// Mock vscode module with proper TreeItem class
jest.mock('vscode', () => ({
  TreeItem: class TreeItem {
    label: string | undefined;
    collapsibleState: number;
    contextValue: string | undefined;
    iconPath: any;
    description: string | undefined;
    tooltip: string | undefined;
    command: any;
    resourceUri: any;

    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState ?? 0;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeColor: class ThemeColor {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
  ThemeIcon: class ThemeIcon {
    id: string;
    color: any;
    constructor(id: string, color?: any) {
      this.id = id;
      this.color = color;
    }
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
  FileChangeType: {
    Changed: 1,
    Created: 2,
    Deleted: 3,
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  env: {
    openExternal: jest.fn(),
  },
  window: {
    createStatusBarItem: jest.fn().mockReturnValue({
      show: jest.fn(),
      dispose: jest.fn(),
    }),
    createQuickPick: jest.fn().mockReturnValue({
      items: [],
      placeholder: '',
      onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
      onDidHide: jest.fn(() => ({ dispose: jest.fn() })),
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    }),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showSaveDialog: jest.fn(),
    registerTreeDataProvider: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn((_handler: (editor: any) => any) => ({ dispose: jest.fn() })),
  },
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn(),
      update: jest.fn(),
    }),
    onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
    onDidSaveTextDocument: jest.fn((_handler: (document: any) => any) => ({ dispose: jest.fn() })),
    onDidChangeTextDocument: jest.fn((_handler: (event: any) => any) => ({ dispose: jest.fn() })),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
  },
  commands: {
    registerCommand: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    executeCommand: jest.fn(),
  },
  EventEmitter: class EventEmitter {
    private listeners: any[] = [];
    event = (listener: any) => {
      this.listeners.push(listener);
      return { dispose: jest.fn() };
    };
    fire = (data: any) => {
      for (const listener of this.listeners) {
        listener(data);
      }
    };
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
}), { virtual: true });

jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    pragma: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      all: jest.fn(),
      get: jest.fn(),
    }),
    transaction: jest.fn((fn) => fn),
    close: jest.fn(),
  }));
});
