/**
 * ColorDecorationManager
 * Manages VSCode text decorations for colored text ranges
 *
 * Responsibilities:
 * - Create/update/remove text decorations in the editor
 * - Track decoration lifecycle and current state
 * - Convert between VSCode Ranges and character offsets
 * - Handle document changes and clean up decorations on deletions
 * - Provide access to current decorations as ColorAnnotation objects
 */

import * as vscode from 'vscode';
import { ColorAnnotation, ColorPalette } from '../types';
import { Logger } from '../utils/logger';
import { ColorAnnotationRepository } from '../db/colorAnnotationRepository';
import { v4 as uuid } from 'uuid';

const logger = new Logger('ColorDecorationManager');

/**
 * Internal decoration storage
 */
interface DecorationType {
  id?: string; // Original annotation ID from database (undefined if newly created)
  range: vscode.Range;
  color: string;
  type: vscode.TextEditorDecorationType;
}

/**
 * Manages text decorations for color annotations in a VSCode editor
 */
export class ColorDecorationManager {
  private decorations: Map<string, DecorationType> = new Map();
  private storyId: string = '';
  private versionId: string = '';

  constructor(
    private editor: vscode.TextEditor,
    private colorPalette: ColorPalette,
    private repository?: ColorAnnotationRepository
  ) {}

  /**
   * Get the current editor instance
   */
  getEditor(): vscode.TextEditor {
    return this.editor;
  }

  /**
   * Set the context (story and version) for subsequent operations
   */
  setContext(storyId: string, versionId: string): void {
    this.storyId = storyId;
    this.versionId = versionId;
  }

  /**
   * Load annotations from the database for a specific story version
   * Queries the repository and applies decorations to the editor
   * Clears previous decorations before loading new ones
   */
  async loadVersion(storyId: string, versionId: string): Promise<void> {
    try {
      this.storyId = storyId;
      this.versionId = versionId;

      if (!this.repository) {
        logger.debug('No repository available for loading annotations');
        return;
      }

      // Clear existing decorations before loading new version
      this.unloadVersion();

      // Load annotations from database for this story/version
      const annotations = this.repository.findByStoryAndVersion(storyId, versionId);

      logger.debug(
        `Loading ${annotations.length} color annotations for ${storyId}/${versionId}`
      );

      // Validate bounds and apply decorations
      const docLength = this.editor.document.getText().length;
      for (const annotation of annotations) {
        // Skip if out of bounds (file may have changed externally)
        if (annotation.endPos > docLength) {
          logger.warn(
            `Skipping out-of-bounds annotation: ${annotation.id} (end: ${annotation.endPos} > docLength: ${docLength})`
          );
          continue;
        }

        try {
          // Reconstruct Range from character offsets
          const startPos = this.editor.document.positionAt(annotation.startPos);
          const endPos = this.editor.document.positionAt(annotation.endPos);

          // Create range object that works with both real vscode.Range and test mocks
          const range = {
            start: startPos,
            end: endPos,
          };

          // Apply decoration with original annotation ID
          this.applyDecoration(range, annotation.color, annotation.id);
        } catch (error) {
          logger.warn(`Failed to apply decoration for annotation ${annotation.id}`, {
            error,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load version annotations', { error, storyId, versionId });
    }
  }

  /**
   * Apply a color decoration to a text range
   * If a decoration already exists for this range, it will be replaced
   * @param annotationId Optional original ID from database (undefined if newly created)
   */
  applyDecoration(range: vscode.Range | any, color: string, annotationId?: string): void {
    try {
      const key = this.rangeKey(range as any);

      // Remove old decoration if exists
      if (this.decorations.has(key)) {
        this.decorations.get(key)?.type.dispose();
      }

      // Validate color exists in palette
      const hexColor = this.colorPalette[color];
      if (!hexColor) {
        logger.warn(`Color '${color}' not found in palette`);
        return;
      }

      // Create new decoration type with color
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: hexColor,
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
        overviewRulerColor: hexColor,
        overviewRulerLane: vscode.OverviewRulerLane.Left,
      });

      // Apply decoration to editor
      this.editor.setDecorations(decorationType, [range as any]);

      // Store decoration for later retrieval
      this.decorations.set(key, {
        id: annotationId,
        range,
        color,
        type: decorationType,
      });

      logger.debug(`Applied decoration: ${color} at ${key}`);
    } catch (error) {
      logger.error('Failed to apply decoration', error);
    }
  }

  /**
   * Remove a decoration by character offset range
   * Also deletes the annotation from the database if it exists
   *
   * Removes any decoration that overlaps with the given range,
   * even if the boundaries don't match exactly (e.g., if surrounding text was edited)
   */
  removeDecoration(startPos: number, endPos: number): void {
    try {
      // First try exact match for backward compatibility
      const key = `${startPos},${endPos}`;
      const exactDecoration = this.decorations.get(key);

      if (exactDecoration) {
        this.removeDecorationByKey(key, exactDecoration);
        return;
      }

      // If no exact match, find any decoration that overlaps with the selection
      let foundOverlapping = false;
      for (const [decorationKey, decoration] of this.decorations.entries()) {
        const decorationStart = this.editor.document.offsetAt(decoration.range.start);
        const decorationEnd = this.editor.document.offsetAt(decoration.range.end);

        // Check if ranges overlap
        // Ranges overlap if: decoration.start < selection.end AND decoration.end > selection.start
        if (decorationStart < endPos && decorationEnd > startPos) {
          this.removeDecorationByKey(decorationKey, decoration);
          foundOverlapping = true;
        }
      }

      if (!foundOverlapping) {
        logger.debug(`No decoration found at ${startPos},${endPos}`);
      }
    } catch (error) {
      logger.error('Failed to remove decoration', error);
    }
  }

  /**
   * Helper to remove a decoration by key
   * Disposes the decoration and deletes from database if needed
   */
  private removeDecorationByKey(key: string, decoration: DecorationType): void {
    decoration.type.dispose();
    this.decorations.delete(key);

    // Delete from database if repository is available and annotation was loaded from DB
    if (this.repository && decoration.id) {
      const [startPos, endPos] = key.split(',').map(Number);
      this.repository.deleteByRange(this.storyId, this.versionId, startPos, endPos);
      logger.debug(`Deleted annotation from database at ${key}`);
    }

    logger.debug(`Removed decoration at ${key}`);
  }

  /**
   * Unload all decorations for the current version
   * Disposes all decoration types and clears tracking
   */
  unloadVersion(): void {
    try {
      for (const decoration of this.decorations.values()) {
        decoration.type.dispose();
      }
      this.decorations.clear();
      logger.debug('Unloaded all decorations');
    } catch (error) {
      logger.error('Failed to unload version', error);
    }
  }

  /**
   * Get current decorations as ColorAnnotation objects
   * Uses offsetAt() for proper multi-line position tracking
   * Preserves original annotation IDs from database; generates new IDs for newly created annotations
   */
  getDecorations(): ColorAnnotation[] {
    const annotations: ColorAnnotation[] = [];

    for (const decoration of this.decorations.values()) {
      // Convert VSCode range positions to character offsets using offsetAt
      // This handles multi-line documents correctly
      const startOffset = this.editor.document.offsetAt(decoration.range.start);
      const endOffset = this.editor.document.offsetAt(decoration.range.end);

      annotations.push({
        id: decoration.id || uuid(), // Use original ID if loaded from DB, otherwise generate new one
        storyId: this.storyId,
        versionId: this.versionId,
        startPos: startOffset,
        endPos: endOffset,
        color: decoration.color,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return annotations;
  }

  /**
   * Handle document changes and remove decorations if their text is deleted
   * Called when document content changes to maintain consistency
   */
  handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    try {
      for (const change of event.contentChanges) {
        // Check each decoration to see if it was deleted
        for (const [key, decoration] of this.decorations.entries()) {
          // A decoration is deleted if:
          // 1. Its range is entirely within the deleted range
          // 2. The change is a deletion (text is empty)
          if (
            decoration.range.start.isAfterOrEqual(change.range.start) &&
            decoration.range.end.isBeforeOrEqual(change.range.end) &&
            change.text === ''
          ) {
            decoration.type.dispose();
            this.decorations.delete(key);
            logger.debug(`Removed decoration due to text deletion at ${key}`);
          }
        }
      }
    } catch (error) {
      logger.debug('Error handling document change', error);
    }
  }

  /**
   * Generate a unique key for a range based on its character offsets
   * Uses offsetAt() to support multi-line documents
   */
  private rangeKey(range: any): string {
    const startOffset = this.editor.document.offsetAt(range.start);
    const endOffset = this.editor.document.offsetAt(range.end);
    return `${startOffset},${endOffset}`;
  }
}
