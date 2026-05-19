/**
 * Change Icon Command - Update story icon via QuickPick
 */

import * as vscode from 'vscode';
import { StoryRepository } from '../../db/storyRepository';
import { IconRegistry } from '../iconRegistry';
import { CommandResult, CommandHandler } from './commandHandler';
import { Logger } from '../../utils/logger';

const logger = new Logger('ChangeIconCommand');

interface IconQuickPickItem extends vscode.QuickPickItem {
  icon: any; // IconDefinition
}

/**
 * Handles changing a story's icon via QuickPick selection
 */
export class ChangeIconCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private iconRegistry: IconRegistry;
  private refreshCallback?: () => void;

  constructor(
    storyRepository: StoryRepository,
    refreshCallback?: () => void
  ) {
    super('ChangeIconCommand');
    this.storyRepository = storyRepository;
    this.iconRegistry = new IconRegistry();
    this.refreshCallback = refreshCallback;
  }

  protected async validatePrerequisites(): Promise<boolean> {
    // Icon selection doesn't require special prerequisites
    return true;
  }

  async execute(treeItem: any): Promise<CommandResult> {
    try {
      // Validate tree item has storyId
      if (!treeItem?.storyId) {
        return {
          success: false,
          message: 'Invalid tree item: missing storyId',
        };
      }

      // Get story from repository
      const story = this.storyRepository.findById(treeItem.storyId);
      if (!story) {
        const errorMsg = `Story with id ${treeItem.storyId} not found`;
        logger.error(errorMsg);
        vscode.window.showErrorMessage(`Babel: ${errorMsg}`);
        return {
          success: false,
          message: errorMsg,
        };
      }

      // Create QuickPick for icon selection
      const quickPick = vscode.window.createQuickPick<IconQuickPickItem>();

      // Build icon items with current selection highlighted
      const allIcons = this.iconRegistry.getAllIcons();
      const items: IconQuickPickItem[] = allIcons.map((iconDef) => ({
        label: `$(${iconDef.name}) ${iconDef.label}`,
        description: iconDef.category || '',
        detail: iconDef.description,
        icon: iconDef,
        picked: story.iconName === iconDef.name,
      }));

      quickPick.items = items;
      quickPick.placeholder = `Select icon for "${story.displayName}"`;

      // Return promise that resolves when user makes selection
      return new Promise((resolve) => {
        let resolved = false;

        // Handle selection
        const selectionDisposable = quickPick.onDidChangeSelection(
          async (selectedItems: readonly IconQuickPickItem[]) => {
            if (!resolved && selectedItems.length > 0) {
              resolved = true;
              const selectedIcon = selectedItems[0];

              try {
                // Update story icon in repository
                this.storyRepository.updateIcon(story.id, selectedIcon.icon.name);
                logger.info(`Changed icon for story ${story.id} to ${selectedIcon.icon.name}`);

                // Refresh tree view
                this.refreshCallback?.();

                quickPick.dispose();
                resolve({
                  success: true,
                  message: `Icon changed to ${selectedIcon.icon.label}`,
                });
              } catch (error) {
                logger.error(`Failed to update icon: ${error}`);
                vscode.window.showErrorMessage(
                  `Failed to change icon: ${error}`
                );
                quickPick.dispose();
                resolve({
                  success: false,
                  message: `Failed to update icon: ${error}`,
                });
              }
            }
          }
        );

        // Handle close without selection
        const closeDisposable = quickPick.onDidHide(() => {
          if (!resolved) {
            resolved = true;
            selectionDisposable.dispose();
            closeDisposable.dispose();
            resolve({
              success: false,
              message: 'Icon selection cancelled',
            });
          }
        });

        quickPick.show();
      });
    } catch (error) {
      logger.error(`Command failed: ${error}`);
      vscode.window.showErrorMessage(`Failed to change icon: ${error}`);
      return {
        success: false,
        message: `Command failed: ${error}`,
      };
    }
  }
}
