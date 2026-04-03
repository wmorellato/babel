/**
 * Apply Color Command & Remove Color Command Tests
 * Tests for color decoration command handlers
 */

// Mock vscode before importing commands
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    activeTextEditor: undefined,
  },
  commands: {
    registerCommand: jest.fn(),
  },
  Position: class {
    constructor(readonly line: number, readonly character: number) {}
  },
  Range: class {
    constructor(readonly start: any, readonly end: any) {}
  },
  Selection: class {
    constructor(readonly start: any, readonly end: any) {
      this.isEmpty = start.line === end.line && start.character === end.character;
    }
    isEmpty: boolean;
  },
}));

import * as vscode from 'vscode';
import { ApplyColorCommand } from '../../../../src/core/commands/applyColorCommand';
import { RemoveColorCommand } from '../../../../src/core/commands/removeColorCommand';
import { ColorDecorationManager } from '../../../../src/views/colorDecorationManager';
import { Logger } from '../../../../src/utils/logger';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();

describe('ApplyColorCommand', () => {
  let command: ApplyColorCommand;
  let mockColorManager: jest.Mocked<ColorDecorationManager>;
  let mockEditor: jest.Mocked<vscode.TextEditor>;
  let mockDocument: jest.Mocked<vscode.TextDocument>;

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock document
    mockDocument = {
      getText: jest.fn().mockReturnValue('Hello world'),
      positionAt: jest.fn().mockImplementation((offset) => {
        return new vscode.Position(0, offset);
      }),
      offsetAt: jest.fn().mockImplementation((position) => {
        return position.character;
      }),
    } as any;

    // Mock editor
    mockEditor = {
      document: mockDocument,
      selection: new vscode.Selection(
        new vscode.Position(0, 0),
        new vscode.Position(0, 5)
      ),
    } as any;

    // Mock vscode.window.activeTextEditor
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: mockEditor,
    });

    // Mock color manager
    mockColorManager = {
      applyDecoration: jest.fn(),
      removeDecoration: jest.fn(),
      setContext: jest.fn(),
      loadVersion: jest.fn(),
      unloadVersion: jest.fn(),
      getDecorations: jest.fn().mockReturnValue([]),
      handleDocumentChange: jest.fn(),
    } as any;

    command = new ApplyColorCommand(mockColorManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should apply color to text selection', async () => {
    const result = await command.execute('red');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Applied color');
    expect(mockColorManager.applyDecoration).toHaveBeenCalledWith(
      expect.any(Object),
      'red'
    );
  });

  it('should return error when no editor is active', async () => {
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: undefined,
    });

    const result = await command.execute('blue');

    expect(result.success).toBe(false);
    expect(result.message).toBe('No active editor');
    expect(mockColorManager.applyDecoration).not.toHaveBeenCalled();
  });

  it('should return error when selection is empty', async () => {
    mockEditor.selection = new vscode.Selection(
      new vscode.Position(0, 5),
      new vscode.Position(0, 5)
    );

    const result = await command.execute('green');

    expect(result.success).toBe(false);
    expect(result.message).toBe('No text selected');
    expect(mockColorManager.applyDecoration).not.toHaveBeenCalled();
  });

  it('should handle different color names', async () => {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];

    for (const color of colors) {
      mockColorManager.applyDecoration.mockClear();

      const result = await command.execute(color);

      expect(result.success).toBe(true);
      expect(mockColorManager.applyDecoration).toHaveBeenCalledWith(
        expect.any(Object),
        color
      );
    }
  });

  it('should include selection range in result data', async () => {
    mockEditor.selection = new vscode.Selection(
      new vscode.Position(0, 2),
      new vscode.Position(0, 8)
    );

    const result = await command.execute('orange');

    expect(result.data).toHaveProperty('range');
    expect(result.data).toHaveProperty('color', 'orange');
  });

  it('should handle errors gracefully', async () => {
    mockColorManager.applyDecoration.mockImplementation(() => {
      throw new Error('Decoration failed');
    });

    const result = await command.execute('red');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to apply color');
  });


  describe('register', () => {
    it('should register commands for all colors in palette', () => {
      const context = {
        subscriptions: [],
      } as any;

      const palette = {
        red: '#FF0000',
        blue: '#0000FF',
        green: '#00FF00',
      };

      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

      ApplyColorCommand.register(context, mockColorManager, palette);

      expect(registerCommandSpy).toHaveBeenCalledTimes(3);
      expect(context.subscriptions.length).toBe(3);

      // Verify command names
      const commandNames = registerCommandSpy.mock.calls.map((call) => call[0]);
      expect(commandNames).toContain('babel.applyColor.red');
      expect(commandNames).toContain('babel.applyColor.blue');
      expect(commandNames).toContain('babel.applyColor.green');
    });

    it('should add disposables to context subscriptions', () => {
      const mockDisposable = { dispose: jest.fn() };
      jest.spyOn(vscode.commands, 'registerCommand').mockReturnValue(mockDisposable as any);

      const context = {
        subscriptions: [],
      } as any;

      const palette = {
        red: '#FF0000',
        blue: '#0000FF',
      };

      ApplyColorCommand.register(context, mockColorManager, palette);

      expect(context.subscriptions).toHaveLength(2);
      expect(context.subscriptions[0]).toBe(mockDisposable);
      expect(context.subscriptions[1]).toBe(mockDisposable);
    });
  });
});

describe('RemoveColorCommand', () => {
  let command: RemoveColorCommand;
  let mockColorManager: jest.Mocked<ColorDecorationManager>;
  let mockEditor: jest.Mocked<vscode.TextEditor>;
  let mockDocument: jest.Mocked<vscode.TextDocument>;

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock document
    mockDocument = {
      getText: jest.fn().mockReturnValue('Hello world'),
      offsetAt: jest.fn().mockImplementation((position) => {
        return position.character;
      }),
    } as any;

    // Mock editor
    mockEditor = {
      document: mockDocument,
      selection: new vscode.Selection(
        new vscode.Position(0, 0),
        new vscode.Position(0, 5)
      ),
    } as any;

    // Mock vscode.window.activeTextEditor
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: mockEditor,
    });

    // Mock color manager
    mockColorManager = {
      removeDecoration: jest.fn(),
      applyDecoration: jest.fn(),
      setContext: jest.fn(),
      loadVersion: jest.fn(),
      unloadVersion: jest.fn(),
      getDecorations: jest.fn().mockReturnValue([]),
      handleDocumentChange: jest.fn(),
    } as any;

    command = new RemoveColorCommand(mockColorManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should remove color from text selection', async () => {
    const result = await command.execute();

    expect(result.success).toBe(true);
    expect(result.message).toContain('Removed color');
    expect(mockColorManager.removeDecoration).toHaveBeenCalledWith(0, 5);
  });

  it('should convert selection range to character offsets', async () => {
    mockEditor.selection = new vscode.Selection(
      new vscode.Position(0, 3),
      new vscode.Position(0, 8)
    );

    mockDocument.offsetAt.mockImplementation((position) => {
      return position.character;
    });

    const result = await command.execute();

    expect(result.success).toBe(true);
    expect(mockColorManager.removeDecoration).toHaveBeenCalledWith(3, 8);
  });

  it('should return error when no editor is active', async () => {
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: undefined,
    });

    const result = await command.execute();

    expect(result.success).toBe(false);
    expect(result.message).toBe('No active editor');
    expect(mockColorManager.removeDecoration).not.toHaveBeenCalled();
  });

  it('should return error when selection is empty', async () => {
    mockEditor.selection = new vscode.Selection(
      new vscode.Position(0, 5),
      new vscode.Position(0, 5)
    );

    const result = await command.execute();

    expect(result.success).toBe(false);
    expect(result.message).toBe('No text selected');
    expect(mockColorManager.removeDecoration).not.toHaveBeenCalled();
  });

  it('should include offset data in result', async () => {
    mockEditor.selection = new vscode.Selection(
      new vscode.Position(0, 2),
      new vscode.Position(0, 10)
    );

    mockDocument.offsetAt.mockImplementation((position) => {
      return position.character;
    });

    const result = await command.execute();

    expect(result.data).toHaveProperty('startOffset', 2);
    expect(result.data).toHaveProperty('endOffset', 10);
  });

  it('should handle errors gracefully', async () => {
    mockColorManager.removeDecoration.mockImplementation(() => {
      throw new Error('Removal failed');
    });

    const result = await command.execute();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to remove color');
  });


  describe('register', () => {
    it('should register remove color command', () => {
      const context = {
        subscriptions: [],
      } as any;

      const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');
      const mockDisposable = { dispose: jest.fn() };
      registerCommandSpy.mockReturnValue(mockDisposable as any);

      RemoveColorCommand.register(context, mockColorManager);

      expect(registerCommandSpy).toHaveBeenCalledWith(
        'babel.removeColor',
        expect.any(Function)
      );
      expect(context.subscriptions).toHaveLength(1);
      expect(context.subscriptions[0]).toBe(mockDisposable);
    });

    it('should add disposable to context subscriptions', () => {
      const mockDisposable = { dispose: jest.fn() };
      jest.spyOn(vscode.commands, 'registerCommand').mockReturnValue(mockDisposable as any);

      const context = {
        subscriptions: [],
      } as any;

      RemoveColorCommand.register(context, mockColorManager);

      expect(context.subscriptions).toHaveLength(1);
      expect(context.subscriptions[0]).toBe(mockDisposable);
    });
  });
});
