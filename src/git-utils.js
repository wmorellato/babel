const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Wrapper to log git commands for debugging
    function runGit(command, options) {
    try {
        console.debug(command);
    } catch (e) {
        // ignore logging errors
    }
    return execSync(command, options);
}

/**
 * Git utility functions for story versioning
 */

/**
 * Check if git is installed and available
 * @returns {boolean} True if git is available
 */
function isGitAvailable() {
    try {
            runGit('git --version', { stdio: 'ignore' });
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
        runGit('git init', { cwd: directory, stdio: 'ignore' });

        // Set initial branch name
        runGit(`git checkout -b ${initialBranch}`, { cwd: directory, stdio: 'ignore' });

        // Create .gitignore to ignore any potential temp files
        const gitignorePath = path.join(directory, '.gitignore');
        fs.writeFileSync(gitignorePath, '# Babel story repository\n*.tmp\n');

        // Add and commit the .gitignore
        runGit('git add .gitignore', { cwd: directory, stdio: 'ignore' });
        runGit('git commit -m "Initial commit"', { cwd: directory, stdio: 'ignore' });

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

        runGit(`git add "${filename}"`, { cwd: directory, stdio: 'ignore' });
        runGit(`git commit -m "Created ${filename}"`, { cwd: directory, stdio: 'ignore' });

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
        runGit('git add -A', { cwd: directory, stdio: 'ignore' });
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
        const diff = runGit('git diff --cached', { cwd: directory, encoding: 'utf8' });

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
        const diff = runGit('git diff --cached', { cwd: directory, encoding: 'utf8' });

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
        const status = runGit('git diff --cached --name-only', { cwd: directory, encoding: 'utf8' });

        if (!status.trim()) {
            // No staged changes to commit
            return true;
        }

        // Commit
        runGit(`git commit -m "${message}"`, { cwd: directory, stdio: 'ignore' });

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
        const status = runGit('git status --porcelain', { cwd: directory, encoding: 'utf8' });

        if (!status.trim()) {
            // No changes to commit
            return true;
        }

        // Stage all changes
        runGit('git add -A', { cwd: directory, stdio: 'ignore' });

    // Commit
        runGit(`git commit -m "${message}"`, { cwd: directory, stdio: 'ignore' });

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
        runGit(`git checkout -b ${branchName}`, { cwd: directory, stdio: 'ignore' });

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
        runGit(`git checkout ${branchName}`, { cwd: directory, stdio: 'ignore' });

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
        const branch = runGit('git rev-parse --abbrev-ref HEAD', {
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
        runGit('git rev-parse --git-dir', { cwd: directory, stdio: 'ignore' });
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
            runGit(`git branch -m ${newName}`, { cwd: directory, stdio: 'ignore' });
        } else {
            // If we're not on the branch, use the full syntax
            runGit(`git branch -m ${oldName} ${newName}`, { cwd: directory, stdio: 'ignore' });
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
        const output = runGit('git branch --format="%(refname:short)"', {
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
        runGit(`git branch ${deleteFlag} ${branchName}`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to delete branch:', error);
        return false;
    }
}

/**
 * Get the number of commits made today on the current branch
 * @param {string} directory - The git repository directory
 * @returns {number} Number of commits made today
 */
function getTodayCommitCount(directory) {
    try {
        // Get today's date at midnight in ISO format
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Count commits since midnight today
        const output = runGit(`git rev-list --count --since="${todayISO}" HEAD`, {
            cwd: directory,
            encoding: 'utf8'
        });

        return parseInt(output.trim(), 10) || 0;
    } catch (error) {
        console.error('Failed to get today commit count:', error);
        return 0;
    }
}

/**
 * Squash all commits from today into a single commit
 * @param {string} directory - The git repository directory
 * @param {string} message - The commit message for the squashed commit (optional)
 * @returns {boolean} True if successful
 */
function squashTodayCommits(directory, message = null) {
    try {
        const commitCount = getTodayCommitCount(directory);

        if (commitCount <= 1) {
            // Nothing to squash
            return true;
        }

        // Get today's date at midnight in ISO format
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Get the commit hash before today's first commit
        const baseCommitOutput = runGit(`git rev-list --reverse --since="${todayISO}" HEAD | head -n 1`, {
            cwd: directory,
            encoding: 'utf8',
            shell: '/bin/bash'
        });
        const firstTodayCommit = baseCommitOutput.trim();

        if (!firstTodayCommit) {
            console.error('Could not find first commit from today');
            return false;
        }

        // Get the parent of the first commit from today
        const baseCommit = runGit(`git rev-parse ${firstTodayCommit}^`, {
            cwd: directory,
            encoding: 'utf8'
        }).trim();

        // If no custom message provided, collect all commit messages from today
        let finalMessage = message;
        if (!finalMessage) {
            const messages = runGit(`git log --since="${todayISO}" --format=%B HEAD`, {
                cwd: directory,
                encoding: 'utf8'
            }).trim();

            // Create a summary message
            const branch = getCurrentBranch(directory);
            finalMessage = `Work on ${branch} - ${commitCount} commits squashed\n\n${messages}`;
        }

        // Soft reset to the base commit (keeps all changes staged)
        runGit(`git reset --soft ${baseCommit}`, { cwd: directory, stdio: 'ignore' });

        // Commit all the changes with the combined message
        runGit(`git commit -m "${finalMessage.replace(/"/g, '\\"')}"`, { cwd: directory, stdio: 'ignore' });

        return true;
    } catch (error) {
        console.error('Failed to squash today commits:', error);
        return false;
    }
}

/**
 * Get the total net words written today (including staged and unstaged changes)
 * @param {string} directory - The git repository directory
 * @returns {number} Net words written today
 */
function getTodayNetWords(directory) {
    try {
        // Get today's date at midnight in ISO format
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Get the commit count to check if there are any commits today
        const commitCount = getTodayCommitCount(directory);

        if (commitCount === 0) {
            // No commits today, check for unstaged/staged changes only
            const diff = runGit('git diff HEAD', { cwd: directory, encoding: 'utf8' });
            return countWordsInDiff(diff);
        }

        // Get the first commit from today
        const firstTodayCommitOutput = runGit(`git rev-list --reverse --since="${todayISO}" HEAD | head -n 1`, {
            cwd: directory,
            encoding: 'utf8',
            shell: '/bin/bash'
        });
        const firstTodayCommit = firstTodayCommitOutput.trim();

        if (!firstTodayCommit) {
            // No commits found, return 0
            return 0;
        }

        // Get the parent of the first commit from today (state at start of day)
        let baseCommit;
        try {
            baseCommit = runGit(`git rev-parse ${firstTodayCommit}^`, {
                cwd: directory,
                encoding: 'utf8'
            }).trim();
        } catch (error) {
            // First commit has no parent (initial commit), compare against empty tree
            baseCommit = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git's empty tree SHA
        }

        // Get diff from base to current state (including uncommitted changes)
        // This shows all changes made today
        const diff = runGit(`git diff ${baseCommit} HEAD`, { cwd: directory, encoding: 'utf8' });
        let netWords = countWordsInDiff(diff);

        // Also include staged and unstaged changes
        const uncommittedDiff = runGit('git diff HEAD', { cwd: directory, encoding: 'utf8' });
        netWords += countWordsInDiff(uncommittedDiff);

        return netWords;
    } catch (error) {
        console.error('Failed to get today net words:', error);
        return 0;
    }
}

/**
 * Helper function to count net words in a git diff
 * @param {string} diff - The git diff output
 * @returns {number} Net words (additions - deletions)
 */
function countWordsInDiff(diff) {
    if (!diff || !diff.trim()) {
        return 0;
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

    return wordsAdded - wordsDeleted;
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
    deleteBranch,
    getTodayCommitCount,
    squashTodayCommits,
    getTodayNetWords
};
