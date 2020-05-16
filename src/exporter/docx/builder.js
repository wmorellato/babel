const fs = require('fs');
const path = require('path');
const util = require('util');
const xml2js = require('xml2js');
const JSZip = require('jszip');
const mafagafoFaisca = require('./mafagafo-faisca');
// const resources = require('../vscode/resource-manager');

const resources = {
  getResourcePathByName(relpath) {
    const p = path.join(__dirname, '..', '..', '..', 'resources', 'templates', relpath);
    return p;
  }
}

const readFilePromise = util.promisify(fs.readFile);

const ITALICS_RE = new RegExp('\\*(.*?)\\*', 'g');

/**
 * Open the document template and return an AdmZip object.
 * @param {String} templateId 
 */
function getTemplateDocument(zip, templateId) {
  const documentPath = path.join(templateId, 'template.docx');

  return readFilePromise(resources.getResourcePathByName(documentPath))
    .then((buffer) => {
      return zip.loadAsync(buffer);
    })
}

/**
 * Split the document into paragraphs.
 * @param {String} text contains the entire document
 */
function splitDocument(text) {
  if (typeof text !== 'string') {
    return [];
  }

  return text.split('\n\n');
}

/**
 * Splits a paragraph into different formatted parts. Currently
 * dividing only plain format from italics.
 * @param {String} paragraph a raw paragraph string possibly
 *    containing italics
 */
function splitParagraph(paragraph) {
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
      textRuns.push(mafagafoFaisca.newWordRun(text, true));
    } else {
      textRuns.push(mafagafoFaisca.newWordRun(p, false));
    }
  }

  const paraXmlString = mafagafoFaisca.newParagraph(textRuns);
  console.log(paraXmlString);
  return xml2js.parseStringPromise(paraXmlString);
}

async function createDocxDocument(templateId, text) {
  const paragraphs = splitDocument(text);
  const xmlParagraphs = [];

  // we need to preserve the order of the paragraphs, thus await
  // maybe try other approaches later
  const promises = paragraphs.map(async (p) => {
    const xmlP = await createDocxParagraph(templateId, p);
    xmlParagraphs.push(xmlP);
  });

  await Promise.all(promises);

  let zip = new JSZip();

  getTemplateDocument(zip, templateId)
    .then((zipDoc) => {
      return zipDoc.file('word/document.xml').async('string');
    })
    .then((documentFileText) => {
      return xml2js.parseStringPromise(documentFileText);
    })
    .then((xmlDocumentFile) => {
      const builder = new xml2js.Builder();

      xmlParagraphs.forEach((xp) => {
        xmlDocumentFile['w:document']['w:body'][0]['w:p'].push(xp['w:p']);
      });

      zip.file('word/document.xml', builder.buildObject(xmlDocumentFile));
      writeDocxDocument(zip);
    });
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

createDocxDocument('mafagafo-faisca', 'This is *italics* inside a paragraph. *Another* italics. Have fun.');
// console.log(splitDocument('One paragrapht.\n\nTwo paragraphs.\n\n"Three."'));
// console.log(splitParagraph('This is *italics* inside a paragraph. *Another* italics. Have fun.'));
// console.log(splitParagraph('A paragraph with no italics.'));
