const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Git utility functions for story versioning
 */

/**
 * Check if git is installed and available
 * @returns {boolean} True if git is available
 */
function isGitAvailable() {
    try {
        execSync('git --version', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Initialize a git repository in the specified directory
 * @param {string} directory - The directory to initialize git in
 * @param {string} initialBranch - The name of the initial branch (default: 'draft1')
 * @returns {boolean} True if successful
 */
function initGitRepo(directory, initialBranch = 'draft1') {
    try {
        // Initialize git repository
        execSync('git init', { cwd: directory, stdio: 'ignore' });

        // Set initial branch name
        execSync(`git checkout -b ${initialBranch}`, { cwd: directory, stdio: 'ignore' });

        // Create .gitignore to ignore any potential temp files
        const gitignorePath = path.join(directory, '.gitignore');
        fs.writeFileSync(gitignorePath, '# Babel story repository\n*.tmp\n');

        // Add and commit the .gitignore
        execSync('git add .gitignore', { cwd: directory, stdio: 'ignore' });
        execSync('git commit -m "Initial commit"', { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to initialize git repository:', error);
        return false;
    }
}

/**
 * Create and commit a file in the git repository
 * @param {string} directory - The git repository directory
 * @param {string} filename - The filename to create
 * @param {string} content - The initial content (default: empty string)
 * @returns {boolean} True if successful
 */
function createAndCommitFile(directory, filename, content = '') {
    try {
        const filePath = path.join(directory, filename);
        fs.writeFileSync(filePath, content);

        execSync(`git add "${filename}"`, { cwd: directory, stdio: 'ignore' });
        execSync(`git commit -m "Created ${filename}"`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to create and commit file:', error);
        return false;
    }
}

/**
 * Stage changes in the repository
 * @param {string} directory - The git repository directory
 * @returns {boolean} True if successful
 */
function stageChanges(directory) {
    try {
        execSync('git add -A', { cwd: directory, stdio: 'ignore' });
        return true;
    } catch (error) {
        console.error('Failed to stage changes:', error);
        return false;
    }
}

/**
 * Get the character count of staged changes (additions only)
 * @param {string} directory - The git repository directory
 * @returns {number} Number of characters in added lines
 */
function getStagedChangesSize(directory) {
    try {
        // Get staged diff
        const diff = execSync('git diff --cached', { cwd: directory, encoding: 'utf8' });

        if (!diff.trim()) {
            return 0;
        }

        // Count characters in added lines (lines starting with +, excluding +++ headers)
        const lines = diff.split('\n');
        let charCount = 0;

        for (const line of lines) {
            // Count additions, but skip diff metadata lines
            if (line.startsWith('+') && !line.startsWith('+++')) {
                // Remove the + prefix and count characters
                charCount += line.slice(1).length;
            }
        }

        return charCount;
    } catch (error) {
        console.error('Failed to get staged changes size:', error);
        return 0;
    }
}

/**
 * Get the net word count of staged changes (additions minus deletions)
 * @param {string} directory - The git repository directory
 * @returns {object} Object with wordsAdded, wordsDeleted, and netWords
 */
function getStagedWordCount(directory) {
    try {
        // Get staged diff
        const diff = execSync('git diff --cached', { cwd: directory, encoding: 'utf8' });

        if (!diff.trim()) {
            return { wordsAdded: 0, wordsDeleted: 0, netWords: 0 };
        }

        const lines = diff.split('\n');
        let wordsAdded = 0;
        let wordsDeleted = 0;

        for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                // Added line - count words
                const text = line.slice(1).trim();
                if (text.length > 0) {
                    wordsAdded += text.split(/\s+/).filter(w => w.length > 0).length;
                }
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                // Deleted line - count words
                const text = line.slice(1).trim();
                if (text.length > 0) {
                    wordsDeleted += text.split(/\s+/).filter(w => w.length > 0).length;
                }
            }
        }

        return {
            wordsAdded,
            wordsDeleted,
            netWords: wordsAdded - wordsDeleted,
        };
    } catch (error) {
        console.error('Failed to get staged word count:', error);
        return { wordsAdded: 0, wordsDeleted: 0, netWords: 0 };
    }
}

/**
 * Commit staged changes in the repository
 * @param {string} directory - The git repository directory
 * @param {string} message - The commit message
 * @returns {boolean} True if successful
 */
function commitStaged(directory, message = 'Auto-save') {
    try {
        // Check if there are any staged changes
        const status = execSync('git diff --cached --name-only', { cwd: directory, encoding: 'utf8' });

        if (!status.trim()) {
            // No staged changes to commit
            return true;
        }

        // Commit
        execSync(`git commit -m "${message}"`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to commit changes:', error);
        return false;
    }
}

/**
 * Commit changes in the repository (legacy function - stages and commits)
 * @param {string} directory - The git repository directory
 * @param {string} message - The commit message
 * @returns {boolean} True if successful
 */
function commit(directory, message = 'Auto-save') {
    try {
        // Check if there are any changes to commit
        const status = execSync('git status --porcelain', { cwd: directory, encoding: 'utf8' });

        if (!status.trim()) {
            // No changes to commit
            return true;
        }

        // Stage all changes
        execSync('git add -A', { cwd: directory, stdio: 'ignore' });

        // Commit
        execSync(`git commit -m "${message}"`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to commit changes:', error);
        return false;
    }
}

/**
 * Create a new branch from the current branch
 * @param {string} directory - The git repository directory
 * @param {string} branchName - The name of the new branch
 * @returns {boolean} True if successful
 */
function createBranch(directory, branchName) {
    try {
        // Create and checkout the new branch
        execSync(`git checkout -b ${branchName}`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to create branch:', error);
        return false;
    }
}

/**
 * Checkout a branch
 * @param {string} directory - The git repository directory
 * @param {string} branchName - The name of the branch to checkout
 * @returns {boolean} True if successful
 */
function checkoutBranch(directory, branchName) {
    try {
        execSync(`git checkout ${branchName}`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to checkout branch:', error);
        return false;
    }
}

/**
 * Get the current branch name
 * @param {string} directory - The git repository directory
 * @returns {string|null} The current branch name or null if error
 */
function getCurrentBranch(directory) {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: directory,
            encoding: 'utf8'
        }).trim();

        return branch;
    } catch (error) {
        console.error('Failed to get current branch:', error);
        return null;
    }
}

/**
 * Check if a directory is a git repository
 * @param {string} directory - The directory to check
 * @returns {boolean} True if it's a git repository
 */
function isGitRepo(directory) {
    try {
        execSync('git rev-parse --git-dir', { cwd: directory, stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Rename a branch
 * @param {string} directory - The git repository directory
 * @param {string} oldName - The old branch name
 * @param {string} newName - The new branch name
 * @returns {boolean} True if successful
 */
function renameBranch(directory, oldName, newName) {
    try {
        const currentBranch = getCurrentBranch(directory);

        if (currentBranch === oldName) {
            // If we're on the branch, rename it directly
            execSync(`git branch -m ${newName}`, { cwd: directory, stdio: 'ignore' });
        } else {
            // If we're not on the branch, use the full syntax
            execSync(`git branch -m ${oldName} ${newName}`, { cwd: directory, stdio: 'ignore' });
        }

        return true;
    } catch (error) {
        console.error('Failed to rename branch:', error);
        return false;
    }
}

/**
 * Get all branches in the repository
 * @param {string} directory - The git repository directory
 * @returns {string[]} Array of branch names
 */
function getAllBranches(directory) {
    try {
        const output = execSync('git branch --format="%(refname:short)"', {
            cwd: directory,
            encoding: 'utf8'
        });

        return output.trim().split('\n').filter(b => b.length > 0);
    } catch (error) {
        console.error('Failed to get branches:', error);
        return [];
    }
}

/**
 * Delete a branch
 * @param {string} directory - The git repository directory
 * @param {string} branchName - The name of the branch to delete
 * @param {boolean} force - Force delete even if not merged (default: false)
 * @returns {boolean} True if successful
 */
function deleteBranch(directory, branchName, force = false) {
    try {
        const currentBranch = getCurrentBranch(directory);

        // Cannot delete the current branch, switch to another branch first
        if (currentBranch === branchName) {
            const allBranches = getAllBranches(directory);
            const otherBranches = allBranches.filter(b => b !== branchName);

            if (otherBranches.length === 0) {
                console.error('Cannot delete the only branch in the repository');
                return false;
            }

            // Switch to the first available branch
            checkoutBranch(directory, otherBranches[0]);
        }

        const deleteFlag = force ? '-D' : '-d';
        execSync(`git branch ${deleteFlag} ${branchName}`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to delete branch:', error);
        return false;
    }
}

module.exports = {
    isGitAvailable,
    initGitRepo,
    createAndCommitFile,
    commit,
    stageChanges,
    getStagedChangesSize,
    getStagedWordCount,
    commitStaged,
    createBranch,
    checkoutBranch,
    getCurrentBranch,
    isGitRepo,
    renameBranch,
    getAllBranches,
    deleteBranch
};
