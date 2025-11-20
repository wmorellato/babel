const vscode = require('vscode');

/**
 * Manages inline comments in markdown files, similar to Google Docs
 * Comments are inserted as [a], [b], [c], etc. inline
 * and collected at the end of the document in a comment section
 */
class CommentManager {
    constructor() {
        this.commentRegex = /\[([a-z]+)\]/g;
        this.commentSectionRegex = /^(\[([a-z]+)\])(.*)$/gm;
    }

    /**
     * Parse all comments from a document
     * @param {string} text - The document text
     * @returns {Object} - { inlineRefs: Set, comments: Map }
     */
    parseComments(text) {
        const inlineRefs = new Set();
        const comments = new Map();

        // Find all inline comment references
        const matches = text.matchAll(this.commentRegex);
        for (const match of matches) {
            inlineRefs.add(match[1]);
        }

        // Find comment section (usually at the end)
        // Look for lines that start with [x]
        const lines = text.split('\n');
        let inCommentSection = false;
        let currentCommentId = null;
        let currentCommentText = '';
        let currentOriginalText = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if this line starts a new comment definition
            const commentMatch = line.match(/^\[([a-z]+)\](.*)$/);

            if (commentMatch) {
                // Save previous comment if exists
                if (currentCommentId) {
                    comments.set(currentCommentId, {
                        text: currentCommentText.trim(),
                        originalText: currentOriginalText.trim(),
                        lineNumber: i - 1
                    });
                }

                inCommentSection = true;
                currentCommentId = commentMatch[1];
                currentCommentText = commentMatch[2];
                currentOriginalText = '';
            } else if (inCommentSection && line.startsWith('>>')) {
                // This is the original text reference
                currentOriginalText = line.substring(2).trim();
            } else if (inCommentSection && currentCommentId) {
                // Continue previous comment text
                currentCommentText += '\n' + line;
            }
        }

        // Save last comment
        if (currentCommentId) {
            comments.set(currentCommentId, {
                text: currentCommentText.trim(),
                originalText: currentOriginalText.trim()
            });
        }

        return { inlineRefs, comments };
    }

    /**
     * Get the next available comment tag
     * @param {Set} existingRefs - Set of existing comment references
     * @returns {string} - Next available tag (a, b, c, ..., z, aa, ab, etc.)
     */
    getNextCommentTag(existingRefs) {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';

        // Try single letters first
        for (let char of alphabet) {
            if (!existingRefs.has(char)) {
                return char;
            }
        }

        // Try double letters
        for (let first of alphabet) {
            for (let second of alphabet) {
                const tag = first + second;
                if (!existingRefs.has(tag)) {
                    return tag;
                }
            }
        }

        // Fallback to timestamp-based tag
        return 'x' + Date.now().toString(36);
    }

    /**
     * Find all inline comment references in the text
     * @param {string} text - The document text
     * @returns {Array} - Array of {tag, position} objects
     */
    findInlineReferences(text) {
        const refs = [];
        const regex = /\[([a-z]+)\]/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            refs.push({
                tag: match[1],
                start: match.index,
                end: match.index + match[0].length,
                fullMatch: match[0]
            });
        }

        return refs;
    }

    /**
     * Find orphan tags (defined in comment section but not in text)
     * @param {string} text - The document text
     * @returns {Set} - Set of orphan tag IDs
     */
    findOrphanTags(text) {
        const { inlineRefs, comments } = this.parseComments(text);
        const orphans = new Set();

        for (const commentId of comments.keys()) {
            if (!inlineRefs.has(commentId)) {
                orphans.add(commentId);
            }
        }

        return orphans;
    }

    /**
     * Remove orphan tags from the comment section
     * @param {string} text - The document text
     * @returns {string} - Updated text without orphan tags
     */
    removeOrphanTags(text) {
        const orphans = this.findOrphanTags(text);

        if (orphans.size === 0) {
            return text;
        }

        const lines = text.split('\n');
        const result = [];
        let skipUntilNextComment = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const commentMatch = line.match(/^\[([a-z]+)\]/);

            if (commentMatch) {
                const commentId = commentMatch[1];
                if (orphans.has(commentId)) {
                    // Skip this comment and all its content
                    skipUntilNextComment = true;
                    continue;
                } else {
                    skipUntilNextComment = false;
                    result.push(line);
                }
            } else if (!skipUntilNextComment) {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * Insert a comment at a specific position
     * @param {string} text - The document text
     * @param {number} position - Position to insert the comment tag
     * @param {string} selectedText - The text that was selected
     * @param {string} commentText - The comment text
     * @returns {Object} - { newText, commentTag }
     */
    insertComment(text, position, selectedText, commentText) {
        const { inlineRefs, comments } = this.parseComments(text);
        const commentTag = this.getNextCommentTag(inlineRefs);

        // Insert the tag at the specified position
        const beforeTag = text.substring(0, position);
        const afterTag = text.substring(position);
        const tagText = `[${commentTag}]`;

        // Find or create comment section
        let commentSectionStart = text.lastIndexOf('\n[');
        let hasCommentSection = false;

        // Check if there's already a comment section
        for (const [id] of comments) {
            hasCommentSection = true;
            break;
        }

        let newText;
        if (hasCommentSection) {
            // Append to existing comment section
            newText = beforeTag + tagText + afterTag + `\n[${commentTag}]${commentText}\n>>${selectedText}`;
        } else {
            // Create new comment section
            const separator = '\n\n\n\n\n';
            newText = beforeTag + tagText + afterTag + separator + `[${commentTag}]${commentText}\n>>${selectedText}`;
        }

        return { newText, commentTag };
    }

    /**
     * Update an existing comment
     * @param {string} text - The document text
     * @param {string} commentTag - The comment tag to update
     * @param {string} newCommentText - The new comment text
     * @returns {string} - Updated text
     */
    updateComment(text, commentTag, newCommentText) {
        const lines = text.split('\n');
        const result = [];
        let inTargetComment = false;
        let updated = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const commentMatch = line.match(/^\[([a-z]+)\]/);

            if (commentMatch) {
                const commentId = commentMatch[1];
                if (commentId === commentTag) {
                    // Replace this comment
                    result.push(`[${commentTag}]${newCommentText}`);
                    inTargetComment = true;
                    updated = true;
                    continue;
                } else {
                    inTargetComment = false;
                    result.push(line);
                }
            } else if (inTargetComment && line.trim().startsWith('>>')) {
                // Keep the original text reference
                result.push(line);
                inTargetComment = false;
            } else if (!inTargetComment) {
                result.push(line);
            }
        }

        if (!updated) {
            // Comment not found, append it
            result.push(`[${commentTag}]${newCommentText}`);
        }

        return result.join('\n');
    }

    /**
     * Delete a comment
     * @param {string} text - The document text
     * @param {string} commentTag - The comment tag to delete
     * @returns {string} - Updated text without the comment tag and definition
     */
    deleteComment(text, commentTag) {
        // Remove inline reference
        const tagRegex = new RegExp(`\\[${commentTag}\\]`, 'g');
        let newText = text.replace(tagRegex, '');

        // Remove from comment section
        const lines = newText.split('\n');
        const result = [];
        let inTargetComment = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const commentMatch = line.match(/^\[([a-z]+)\]/);

            if (commentMatch) {
                const commentId = commentMatch[1];
                if (commentId === commentTag) {
                    inTargetComment = true;
                    continue;
                } else {
                    inTargetComment = false;
                    result.push(line);
                }
            } else if (inTargetComment && line.trim().startsWith('>>')) {
                // Skip the original text reference too
                inTargetComment = false;
                continue;
            } else if (!inTargetComment) {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * Get comment at a specific position (for hover provider)
     * @param {string} text - The document text
     * @param {number} position - Position in the document
     * @returns {Object|null} - Comment object or null if no comment at position
     */
    getCommentAtPosition(text, position) {
        const refs = this.findInlineReferences(text);

        for (const ref of refs) {
            if (position >= ref.start && position <= ref.end) {
                const { comments } = this.parseComments(text);
                const comment = comments.get(ref.tag);

                if (comment) {
                    return {
                        tag: ref.tag,
                        text: comment.text,
                        originalText: comment.originalText,
                        range: { start: ref.start, end: ref.end }
                    };
                }
            }
        }

        return null;
    }
}

module.exports = CommentManager;
