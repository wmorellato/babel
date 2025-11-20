const vscode = require('vscode');
const CommentManager = require('../comment-manager');

/**
 * Provides VSCode integration for inline comments
 * Handles commands, hover provider, decorations, and UI dialogs
 */
class CommentProvider {
    constructor() {
        this.commentManager = new CommentManager();
        this.decorationType = null;
        this.disposables = [];
    }

    /**
     * Activate the comment provider
     * @param {vscode.ExtensionContext} context - VSCode extension context
     */
    activate(context) {
        // Create decoration type for comment tags
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editorInfo.foreground'),
            borderRadius: '3px',
            cursor: 'pointer',
            after: {
                contentText: '💬',
                margin: '0 0 0 4px'
            }
        });

        // Register commands
        this.disposables.push(
            vscode.commands.registerCommand('babel.addComment', () => this.addComment())
        );

        this.disposables.push(
            vscode.commands.registerCommand('babel.editComment', (args) => this.editComment(args))
        );

        this.disposables.push(
            vscode.commands.registerCommand('babel.deleteComment', (args) => this.deleteComment(args))
        );

        // Register hover provider for markdown files
        this.disposables.push(
            vscode.languages.registerHoverProvider('markdown', {
                provideHover: (document, position) => this.provideHover(document, position)
            })
        );

        // Update decorations when editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Clean up orphan tags on save
        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument(event => {
                if (event.document.languageId === 'markdown') {
                    event.waitUntil(this.cleanupOrphanTags(event.document));
                }
            })
        );

        // Initial decoration
        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor);
        }

        // Add all disposables to context
        this.disposables.forEach(d => context.subscriptions.push(d));
    }

    /**
     * Update decorations for comment tags in the active editor
     * @param {vscode.TextEditor} editor - The active text editor
     */
    updateDecorations(editor) {
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        const text = editor.document.getText();
        const refs = this.commentManager.findInlineReferences(text);
        const decorations = [];

        for (const ref of refs) {
            const startPos = editor.document.positionAt(ref.start);
            const endPos = editor.document.positionAt(ref.end);
            const range = new vscode.Range(startPos, endPos);

            decorations.push({
                range,
                hoverMessage: `Comment [${ref.tag}] - Click to edit or delete`
            });
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    /**
     * Provide hover information for comment tags
     * @param {vscode.TextDocument} document - The document
     * @param {vscode.Position} position - The cursor position
     * @returns {vscode.Hover|null} - Hover information
     */
    provideHover(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const comment = this.commentManager.getCommentAtPosition(text, offset);

        if (!comment) {
            return null;
        }

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        // Create hover content with comment text and action buttons
        markdown.appendMarkdown(`**Comment [${comment.tag}]**\n\n`);

        if (comment.originalText) {
            markdown.appendMarkdown(`*"${comment.originalText}"*\n\n`);
        }

        markdown.appendMarkdown(`${comment.text}\n\n`);
        markdown.appendMarkdown(`---\n\n`);

        // Add action links
        const editCommand = encodeURIComponent(JSON.stringify([comment.tag, comment.text]));
        const deleteCommand = encodeURIComponent(JSON.stringify([comment.tag]));

        markdown.appendMarkdown(
            `[✏️ Edit](command:babel.editComment?${editCommand} "Edit comment") | ` +
            `[🗑️ Delete](command:babel.deleteComment?${deleteCommand} "Delete comment")`
        );

        return new vscode.Hover(markdown);
    }

    /**
     * Add a new comment at the current selection
     */
    async addComment() {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a markdown file to add comments.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText) {
            vscode.window.showErrorMessage('Please select text to add a comment.');
            return;
        }

        // Show input box for comment text
        const commentText = await vscode.window.showInputBox({
            prompt: 'Enter your comment',
            placeHolder: 'Type your comment here...',
            value: '',
            ignoreFocusOut: true
        });

        if (commentText === undefined) {
            return; // User cancelled
        }

        // Get current document text
        const text = editor.document.getText();
        const position = editor.document.offsetAt(selection.end);

        // Insert comment
        const { newText, commentTag } = this.commentManager.insertComment(
            text,
            position,
            selectedText,
            commentText
        );

        // Replace entire document
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(text.length)
        );

        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, newText);
        });

        vscode.window.showInformationMessage(`Comment [${commentTag}] added successfully!`);
    }

    /**
     * Edit an existing comment
     * @param {Array} args - [commentTag, currentText]
     */
    async editComment(args) {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        let commentTag, currentText;

        if (Array.isArray(args) && args.length >= 2) {
            [commentTag, currentText] = args;
        } else {
            // If no args, try to get comment at cursor position
            const position = editor.selection.active;
            const offset = editor.document.offsetAt(position);
            const text = editor.document.getText();
            const comment = this.commentManager.getCommentAtPosition(text, offset);

            if (!comment) {
                vscode.window.showErrorMessage('No comment found at cursor position.');
                return;
            }

            commentTag = comment.tag;
            currentText = comment.text;
        }

        // Show input box with current text
        const newCommentText = await vscode.window.showInputBox({
            prompt: `Edit comment [${commentTag}]`,
            placeHolder: 'Type your comment here...',
            value: currentText,
            ignoreFocusOut: true
        });

        if (newCommentText === undefined) {
            return; // User cancelled
        }

        // Update comment
        const text = editor.document.getText();
        const newText = this.commentManager.updateComment(text, commentTag, newCommentText);

        // Replace entire document
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(text.length)
        );

        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, newText);
        });

        vscode.window.showInformationMessage(`Comment [${commentTag}] updated successfully!`);
    }

    /**
     * Delete a comment
     * @param {Array} args - [commentTag]
     */
    async deleteComment(args) {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        let commentTag;

        if (Array.isArray(args) && args.length >= 1) {
            [commentTag] = args;
        } else {
            // If no args, try to get comment at cursor position
            const position = editor.selection.active;
            const offset = editor.document.offsetAt(position);
            const text = editor.document.getText();
            const comment = this.commentManager.getCommentAtPosition(text, offset);

            if (!comment) {
                vscode.window.showErrorMessage('No comment found at cursor position.');
                return;
            }

            commentTag = comment.tag;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
            `Delete comment [${commentTag}]?`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        // Delete comment
        const text = editor.document.getText();
        const newText = this.commentManager.deleteComment(text, commentTag);

        // Replace entire document
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(text.length)
        );

        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, newText);
        });

        vscode.window.showInformationMessage(`Comment [${commentTag}] deleted successfully!`);
    }

    /**
     * Clean up orphan tags before saving
     * @param {vscode.TextDocument} document - The document being saved
     * @returns {Promise<vscode.TextEdit[]>} - Text edits to apply
     */
    async cleanupOrphanTags(document) {
        const text = document.getText();
        const orphans = this.commentManager.findOrphanTags(text);

        if (orphans.size === 0) {
            return [];
        }

        const newText = this.commentManager.removeOrphanTags(text);

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );

        return [vscode.TextEdit.replace(fullRange, newText)];
    }

    /**
     * Deactivate the comment provider
     */
    deactivate() {
        this.disposables.forEach(d => d.dispose());
        if (this.decorationType) {
            this.decorationType.dispose();
        }
    }
}

module.exports = CommentProvider;
