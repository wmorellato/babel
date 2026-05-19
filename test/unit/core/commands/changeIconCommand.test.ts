/**
 * Change Icon Command Tests
 */

import { ChangeIconCommand } from '../../../../src/core/commands/changeIconCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { Story, StoryType } from '../../../../src/types/index';
import * as vscode from 'vscode';

describe('ChangeIconCommand', () => {
  let command: ChangeIconCommand;
  let mockStoryRepository: jest.Mocked<StoryRepository>;
  let mockRefreshCallback: jest.Mock;

  const mockStory: Story = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    displayName: 'My Novel',
    type: StoryType.NOVEL,
    iconName: 'book',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
  };

  const mockTreeItem: any = {
    storyId: '123e4567-e89b-12d3-a456-426614174000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoryRepository = {
      findById: jest.fn().mockReturnValue(mockStory),
      updateIcon: jest.fn(),
    } as any;
    mockRefreshCallback = jest.fn();
    command = new ChangeIconCommand(mockStoryRepository, mockRefreshCallback);
  });

  describe('construction', () => {
    it('should create with story repository and refresh callback', () => {
      const cmd = new ChangeIconCommand(mockStoryRepository, mockRefreshCallback);
      expect(cmd).toBeDefined();
    });

    it('should work without refresh callback', () => {
      const cmd = new ChangeIconCommand(mockStoryRepository);
      expect(cmd).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should reject tree item without storyId', async () => {
      const result = await command.execute({});
      expect(result.success).toBe(false);
      expect(result.message).toContain('storyId');
    });

    it('should reject if story not found', async () => {
      mockStoryRepository.findById.mockReturnValue(undefined);
      const result = await command.execute(mockTreeItem);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should retrieve story by tree item storyId', async () => {
      // Mock QuickPick to close without selection
      (vscode.window.createQuickPick as jest.Mock).mockReturnValue({
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          // Immediately call hide callback to close without selection
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      });

      await command.execute(mockTreeItem);
      expect(mockStoryRepository.findById).toHaveBeenCalledWith(mockTreeItem.storyId);
    });
  });

  describe('QuickPick creation', () => {
    beforeEach(() => {
      (vscode.window.createQuickPick as jest.Mock).mockReturnValue({
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      });
    });

    it('should create QuickPick', async () => {
      await command.execute(mockTreeItem);
      expect(vscode.window.createQuickPick).toHaveBeenCalled();
    });

    it('should show QuickPick', async () => {
      const mockQuickPick = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      await command.execute(mockTreeItem);
      expect(mockQuickPick.show).toHaveBeenCalled();
    });

    it('should populate QuickPick items with icons', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      await command.execute(mockTreeItem);

      expect(mockQuickPick.items.length).toBeGreaterThan(0);
      // Verify items have VSCode icon format
      mockQuickPick.items.forEach((item: any) => {
        expect(item.label).toMatch(/^\$\([a-z-]+\)\s.+/);
      });
    });

    it('should mark current icon as picked', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      await command.execute(mockTreeItem);

      // Find the book icon item (current icon for mockStory)
      const pickedItems = mockQuickPick.items.filter((item: any) => item.picked);
      const bookItem = mockQuickPick.items.find((item: any) =>
        item.icon.name === 'book'
      );

      expect(bookItem).toBeDefined();
      if (bookItem) {
        expect(bookItem.picked).toBe(true);
      }
    });
  });

  describe('icon update', () => {
    it('should update icon on selection', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn((cb) => {
          // Simulate selection of star icon
          setTimeout(() => {
            cb([{
              label: '$(star) Star',
              icon: { name: 'star', label: 'Star' },
            }]);
          }, 0);
          return { dispose: jest.fn() };
        }),
        onDidHide: jest.fn(() => ({ dispose: jest.fn() })),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      await command.execute(mockTreeItem);

      expect(mockStoryRepository.updateIcon).toHaveBeenCalledWith(
        mockTreeItem.storyId,
        'star'
      );
    });

    it('should refresh tree on successful icon update', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn((cb) => {
          setTimeout(() => {
            cb([{
              label: '$(lightbulb) Lightbulb',
              icon: { name: 'lightbulb', label: 'Lightbulb' },
            }]);
          }, 0);
          return { dispose: jest.fn() };
        }),
        onDidHide: jest.fn(() => ({ dispose: jest.fn() })),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      await command.execute(mockTreeItem);

      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should return success on icon update', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn((cb) => {
          setTimeout(() => {
            cb([{
              label: '$(archive) Archive',
              icon: { name: 'archive', label: 'Archive' },
            }]);
          }, 0);
          return { dispose: jest.fn() };
        }),
        onDidHide: jest.fn(() => ({ dispose: jest.fn() })),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(true);
    });

    it('should return failure on cancel', async () => {
      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn(() => ({ dispose: jest.fn() })),
        onDidHide: jest.fn((cb) => {
          // Call hide without selection to simulate cancel
          setTimeout(() => cb(), 0);
          return { dispose: jest.fn() };
        }),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled');
    });

    it('should handle update errors gracefully', async () => {
      mockStoryRepository.updateIcon.mockImplementation(() => {
        throw new Error('Database error');
      });

      const mockQuickPick: any = {
        items: [],
        placeholder: '',
        onDidChangeSelection: jest.fn((cb) => {
          setTimeout(() => {
            cb([{
              label: '$(flame) Flame',
              icon: { name: 'flame', label: 'Flame' },
            }]);
          }, 0);
          return { dispose: jest.fn() };
        }),
        onDidHide: jest.fn(() => ({ dispose: jest.fn() })),
        show: jest.fn(),
        dispose: jest.fn(),
      };

      (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });
  });
});
