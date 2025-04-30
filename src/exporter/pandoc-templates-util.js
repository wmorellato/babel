/**
 * Utility for calling Pandoc from VS Code extensions
 * Handles Markdown conversion to various formats with error handling
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');

/**
 * Custom error class for Pandoc-related errors
 */
class PandocError extends Error {
  constructor(message, stderr) {
    super(message);
    this.name = 'PandocError';
    this.stderr = stderr;
  }
}

/**
 * Checks if Pandoc is installed and available
 * @returns {Promise<boolean>} Promise that resolves to true if Pandoc is available, rejects with error otherwise
 */
async function checkPandocAvailability() {
  return new Promise((resolve, reject) => {
    const process = spawn('pandoc', ['--version']);
    
    process.on('error', (err) => {
      reject(new PandocError('Pandoc is not installed or not found in PATH. Please install Pandoc first.'));
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new PandocError(`Pandoc check failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Convert directly from input file to output file using Pandoc CLI
 * @param {string} inputFile Path to the input file
 * @param {Object} options Pandoc conversion options
 * @param {string} [options.from] Input format (if not specified, will be determined from file extension)
 * @param {string} options.to Output format
 * @param {string[]} [options.args=[]] Additional Pandoc arguments
 * @param {string} [options.outputFile] Output file path (if not specified, will be derived from input file)
 * @param {number} [options.timeout=30000] Timeout in milliseconds
 * @returns {Promise<string>} Path to the output file or converted content
 */
async function convertFileWithPandocTemplates(inputFile, options) {
  if (!fs.existsSync(inputFile)) {
    throw new PandocError(`Input file not found: ${inputFile}`);
  }
  
  // Set default output file if not provided
  let outputFile = options.outputFile;
  if (!outputFile) {
    const parsedPath = path.parse(inputFile);
    outputFile = path.join(parsedPath.dir, `${parsedPath.name}.${options.to}`);
  }
  
  // Set default values
  const pandocTemplatesScript = path.join(settings.getPandocTemplatesLocation(), 'bin', 'md2short.sh');
  const args = [
    '-m',
    '-x',
    '-o', outputFile,
    inputFile,
    ...(options.args || [])
  ];

  try {
    // Ensure Pandoc is available before proceeding
    await checkPandocAvailability();
    
    return await new Promise((resolve, reject) => {
      const process = spawn(pandocTemplatesScript, args);
      let stdout = '';
      let stderr = '';
      let killed = false;

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('error', (error) => {
        reject(new PandocError(`Failed to spawn Pandoc process: ${error.message}`));
      });
      
      process.on('close', (code) => {
        if (killed) return; // Already handled by timeout
        
        if (code === 0) {
          // Return the output file path if specified, otherwise return converted content
          resolve(options.outputFile || stdout);
        } else {
          reject(new PandocError(`Pandoc conversion failed with code ${code}`, stderr));
        }
      });
    });
  } catch (error) {
    console.error(`Failed to convert file. Command used: ${pandocTemplatesScript} ${args.join(' ')}`);
    if (error instanceof PandocError) {
      throw error;
    }
    throw new PandocError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convenience method to convert a Markdown file to epub
 * @param {string} inputFile Path to the markdown file
 * @param {string} [outputFile] Optional output file path (if not provided, will be derived from input file)
 * @param {string[]} [additionalArgs] Optional additional Pandoc arguments
 * @returns {Promise<string>} Path to the output epub file
 */
async function markdownToEpub(inputFile, outputFile, additionalArgs) {
  if (!outputFile) {
    const parsedPath = path.parse(inputFile);
    outputFile = path.join(parsedPath.dir, `${parsedPath.name}.epub`);
  }
  
  return convertFileWithPandocTemplates(inputFile, {
    outputFile,
    args: additionalArgs
  });
}

module.exports = {
  PandocError,
  checkPandocAvailability,
  convertFileWithPandocTemplates,
  markdownToEpub,
};