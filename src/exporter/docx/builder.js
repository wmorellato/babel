const os = require('os');
const fs = require('fs');
const eol = require('eol');
const path = require('path');
const util = require('util');
const JSZip = require('jszip');
const Errors = require('../../errors');
const sections = require('./docx-sections');
const resources = require('../../vscode/resource-manager');

const readFilePromise = util.promisify(fs.readFile);

const ITALICS_RE = new RegExp('\\*(.*?)\\*', 'g');

/**
 * Open the document template and return an AdmZip object.
 * @param {String} templateId 
 */
async function getTemplateDocument(zip, templateId) {
  if (!zip || !templateId) {
    throw new Error(Errors.EXPORT_INVALID_TEMPLATE_ERROR);
  }

  const documentPath = path.join('resources', 'templates', templateId + '.docx');

  const buffer = await readFilePromise(resources.getResourcePathByName(documentPath).fsPath);
  return zip.loadAsync(buffer);
}

/**
 * Split the document into paragraphs.
 * @param {String} text contains the entire document
 */
function splitDocument(text) {
  if (typeof text !== 'string') {
    return [];
  }

  return eol.auto(text).split(os.EOL + os.EOL);
}

/**
 * Splits a paragraph into different formatted parts. Currently
 * dividing only plain format from italics.
 * @param {String} paragraph a raw paragraph string possibly
 *    containing italics
 */
function splitParagraph(paragraph) {
  if (typeof paragraph !== 'string') {
    return [];
  }

  let match;
  let paragraphParts = [];
  let index = 0;

  while ((match = ITALICS_RE.exec(paragraph)) !== null) {
    paragraphParts.push(paragraph.slice(index, match.index));
    paragraphParts.push(match[0]);

    index = ITALICS_RE.lastIndex;
  }

  paragraphParts.push(paragraph.slice(index));

  return paragraphParts;
}

/**
 * 
 * @param {String} templateId requested template's id
 * @param {String} text a raw paragraph string possibly
 *    containing italics
 */
function createDocxParagraph(templateId, text) {
  const textRuns = [];
  const paragraphParts = splitParagraph(text);

  for (const p of paragraphParts) {
    if (p.startsWith('*')) {
      const text = p.slice(1, p.length - 1);
      textRuns.push(sections.newWordRun(templateId, text, true));
    } else {
      textRuns.push(sections.newWordRun(templateId, p, false));
    }
  }

  const paraXmlString = sections.newParagraph(templateId, textRuns);
  return paraXmlString;
}

/**
 * Replace all fields in the template document
 * @param {String} documentText template document text read above
 * @param {Paragraph[]} paragraphs docx.Paragraph array
 * @param {Object} storyDescriptor object describing the story passed by
 *    the workspace
 */
function replaceFields(documentText, paragraphs, storyDescriptor) {
  let _documentText = documentText;

  _documentText = _documentText.replace('{content}', paragraphs);
  Object.keys(storyDescriptor).forEach((f) => {
    if (f !== 'content' && storyDescriptor[f]) {
      _documentText = _documentText.replace(new RegExp(`\{${f}\}`, 'g'), storyDescriptor[f]);
    }
  });

  return _documentText;
}

/**
 * Create a docx document from a story based on the requested template.
 * @param {Template} templateDescriptor one of the Template enum items
 * @param {Object} storyDescriptor object containing all necessary information
 *    to export a story
 * @param {String} outputPath the output directory for the document
 */
function createDocxDocument(templateDescriptor, storyDescriptor, outputPath) {
  const paragraphs = splitDocument(storyDescriptor.content);
  const xmlParagraphs = [];

  // we need to preserve the order of the paragraphs, thus await
  // maybe try other approaches later
  paragraphs.forEach((p) => {
    const xmlP = createDocxParagraph(templateDescriptor.id, p);
    xmlParagraphs.push(xmlP);
  });

  let zip = new JSZip();

  return getTemplateDocument(zip, templateDescriptor.id)
    .then((zipDoc) => {
      return zipDoc.file('word/document.xml').async('string');
    })
    .then((documentFileText) => {
      const combinedParas = xmlParagraphs.join(os.EOL + os.EOL);

      zip.file('word/document.xml', replaceFields(documentFileText, combinedParas, storyDescriptor));

      return writeDocxDocument(zip, templateDescriptor, storyDescriptor, outputPath);
    });
}

/**
 * Write the modified docx to the output path.
 * @param {JSZip} zip JSZip object
 * @param {Template} templateDescriptor full template descriptor
 * @param {Object} storyDescriptor story descriptor
 * @param {String} outputPath the output directory for the document
 */
function writeDocxDocument(zip, templateDescriptor, storyDescriptor, outputPath) {
  return new Promise((resolve, reject) => {
    const filename = templateDescriptor.fileNameFormatter(storyDescriptor);
    const fullOutputPath = path.join(outputPath, filename);

    zip
      .generateNodeStream({ type: 'nodebuffer', 'compression': 'DEFLATE' })
      .pipe(fs.createWriteStream(fullOutputPath))
      .on('finish', () => resolve())
      .on('error', (error) => { reject(error); });
  });
}

module.exports = {
  createDocxDocument,
};
