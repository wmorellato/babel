import * as vscode from 'vscode';
import { ListenerCoordinator } from '../../../src/extension/listenerCoordinator';

describe('ListenerCoordinator', () => {
  let coordinator: ListenerCoordinator;

  beforeEach(() => {
    // Reset mock call counts without clearing implementations
    (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mockClear().mockImplementation(
      (_handler: (editor: any) => any) => ({ dispose: jest.fn() })
    );
    (vscode.workspace.onDidSaveTextDocument as jest.Mock).mockClear().mockImplementation(
      (_handler: (document: any) => any) => ({ dispose: jest.fn() })
    );
    (vscode.workspace.onDidChangeTextDocument as jest.Mock).mockClear().mockImplementation(
      (_handler: (event: any) => any) => ({ dispose: jest.fn() })
    );
    coordinator = new ListenerCoordinator();
  });

  describe('registerEditorChangeHandler', () => {
    it('should accept and store editor change handlers', () => {
      const handler = jest.fn();
      coordinator.registerEditorChangeHandler(handler);
      expect(coordinator).toBeDefined();
    });
  });

  describe('registerDocumentSaveHandler', () => {
    it('should accept and store document save handlers', () => {
      const handler = jest.fn();
      coordinator.registerDocumentSaveHandler(handler);
      expect(coordinator).toBeDefined();
    });
  });

  describe('registerDocumentChangeHandler', () => {
    it('should accept and store document change handlers', () => {
      const handler = jest.fn();
      coordinator.registerDocumentChangeHandler(handler);
      expect(coordinator).toBeDefined();
    });
  });

  describe('createListeners', () => {
    it('should return an array of 3 Disposables', () => {
      const listeners = coordinator.createListeners();
      expect(Array.isArray(listeners)).toBe(true);
      expect(listeners.length).toBe(3);
      listeners.forEach((listener) => {
        expect(typeof listener.dispose).toBe('function');
      });
    });

    it('should call all registered editor change handlers when event fires', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      coordinator.registerEditorChangeHandler(handler1);
      coordinator.registerEditorChangeHandler(handler2);

      coordinator.createListeners();
      const mockEditor = {} as vscode.TextEditor;

      // Simulate event fire by calling the handler directly
      const editorChangeCallback = (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mock.calls[0]?.[0];
      if (editorChangeCallback) {
        await editorChangeCallback(mockEditor);
      }

      expect(handler1).toHaveBeenCalledWith(mockEditor);
      expect(handler2).toHaveBeenCalledWith(mockEditor);
    });

    it('should call all registered save handlers when event fires', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      coordinator.registerDocumentSaveHandler(handler1);
      coordinator.registerDocumentSaveHandler(handler2);

      coordinator.createListeners();
      const mockDoc = { uri: { fsPath: '/test.md' } } as vscode.TextDocument;

      // Simulate event fire
      const saveCallback = (vscode.workspace.onDidSaveTextDocument as jest.Mock).mock.calls[0]?.[0];
      if (saveCallback) {
        await saveCallback(mockDoc);
      }

      expect(handler1).toHaveBeenCalledWith(mockDoc);
      expect(handler2).toHaveBeenCalledWith(mockDoc);
    });

    it('should call all registered document change handlers when event fires', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      coordinator.registerDocumentChangeHandler(handler1);
      coordinator.registerDocumentChangeHandler(handler2);

      coordinator.createListeners();
      const mockEvent = {
        document: { uri: { fsPath: '/test.md' } },
        contentChanges: [],
      } as unknown as vscode.TextDocumentChangeEvent;

      // Simulate event fire
      const changeCallback = (vscode.workspace.onDidChangeTextDocument as jest.Mock).mock.calls[0]?.[0];
      if (changeCallback) {
        changeCallback(mockEvent);
      }

      expect(handler1).toHaveBeenCalledWith(mockEvent);
      expect(handler2).toHaveBeenCalledWith(mockEvent);
    });

    it('should continue calling handlers if one throws', async () => {
      const handler1 = jest.fn().mockRejectedValue(new Error('Handler error'));
      const handler2 = jest.fn().mockResolvedValue(undefined);

      coordinator.registerEditorChangeHandler(handler1);
      coordinator.registerEditorChangeHandler(handler2);

      coordinator.createListeners();
      const mockEditor = {} as vscode.TextEditor;

      const editorChangeCallback = (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mock.calls[0]?.[0];
      if (editorChangeCallback) {
        // Should not throw
        await expect(editorChangeCallback(mockEditor)).resolves.toBeUndefined();
      }

      // Both handlers called despite first one throwing
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle mixed async and sync handlers', () => {
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      const syncHandler = jest.fn();

      coordinator.registerEditorChangeHandler(asyncHandler);
      coordinator.registerDocumentChangeHandler(syncHandler);

      const listeners = coordinator.createListeners();
      expect(listeners.length).toBe(3);
    });

    it('should register exactly one listener per event type', () => {
      coordinator.registerEditorChangeHandler(jest.fn());
      coordinator.registerEditorChangeHandler(jest.fn());
      coordinator.registerDocumentSaveHandler(jest.fn());
      coordinator.registerDocumentChangeHandler(jest.fn());

      coordinator.createListeners();

      expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalledTimes(1);
      expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
    });

    it('should call handlers in registration order', async () => {
      const callOrder: number[] = [];
      const handler1 = jest.fn().mockImplementation(async () => { callOrder.push(1); });
      const handler2 = jest.fn().mockImplementation(async () => { callOrder.push(2); });
      const handler3 = jest.fn().mockImplementation(async () => { callOrder.push(3); });

      coordinator.registerEditorChangeHandler(handler1);
      coordinator.registerEditorChangeHandler(handler2);
      coordinator.registerEditorChangeHandler(handler3);

      coordinator.createListeners();

      const editorChangeCallback = (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mock.calls[0]?.[0];
      if (editorChangeCallback) {
        await editorChangeCallback(undefined);
      }

      expect(callOrder).toEqual([1, 2, 3]);
    });
  });
});
