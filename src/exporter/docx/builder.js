const os = require('os');
const fs = require('fs');
const eol = require('eol');
const path = require('path');
const util = require('util');
const JSZip = require('jszip');
const Errors = require('../../errors');
const sections = require('./docx-sections');
// const resources = require('../vscode/resource-manager');

const resources = {
  getResourcePathByName(relpath) {
    const p = path.join(__dirname, '..', '..', '..', 'resources', relpath);
    return p;
  }
}

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

  const documentPath = path.join('templates', templateId + '.docx');

  const buffer = await readFilePromise(resources.getResourcePathByName(documentPath));
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
 * 
 * @param {JSZip} zip 
 */
function writeDocxDocument(zip) {
  zip
    .generateNodeStream({ type: 'nodebuffer', 'compression': 'DEFLATE' })
    .pipe(fs.createWriteStream(path.join(__dirname, 'new_shunn.docx')))
    .on('finish', () => {
      console.log('docx written');
    });
}

async function createDocxDocument(templateId, text) {
  const paragraphs = splitDocument(text);
  const xmlParagraphs = [];

  // we need to preserve the order of the paragraphs, thus await
  // maybe try other approaches later
  paragraphs.forEach((p) => {
    const xmlP = createDocxParagraph(templateId, p);
    xmlParagraphs.push(xmlP);
  });

  let zip = new JSZip();

  getTemplateDocument(zip, templateId)
    .then((zipDoc) => {
      return zipDoc.file('word/document.xml').async('string');
    })
    .then((documentFileText) => {
      const combinedParas = xmlParagraphs.join(os.EOL + os.EOL);
      zip.file('word/document.xml', documentFileText.replace('{content}', combinedParas));
      writeDocxDocument(zip);
    });
}

createDocxDocument('mafagafo-faisca', fs.readFileSync(path.join(__dirname, 'Original.md')).toString());
// console.log(splitDocument('One paragrapht.\n\nTwo paragraphs.\n\n"Three."'));
// console.log(splitParagraph('This is *italics* inside a paragraph. *Another* italics. Have fun.'));
// console.log(splitParagraph('A paragraph with no italics.'));
