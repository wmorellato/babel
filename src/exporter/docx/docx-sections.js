const { Packer, RunFonts, Paragraph, TextRun, XmlAttributeComponent, AlignmentType } = require('docx');
const os = require('os');
const xml = require('xml');
const Errors = require('../../errors');
const utils = require('../utils');
const { Template } = require('../templates');

const DocxSections = [];

// adding sections for each template under its id specified
// in '../templates.js'
DocxSections[Template.MAFAGAFO_FAISCA] = {
  newWordRun(text, italics) {
    const runAttributes = new XmlAttributeComponent({
      'w:rsidDel': '00000000',
      'w:rsidR': '00000000',
      'w:rsidRPr': '00000000',
    });
  
    const textRun = new TextRun({
      font: {
        name: 'Times New Roman',
      },
      text,
      italics,
      size: 24,
    });
  
    textRun.root.push(runAttributes);
  
    return textRun;
  },
  
  newParagraph(wordRuns) {
    const paragraphAttributes = new XmlAttributeComponent({
      'w:rsidR': '00000000',
      'w:rsidDel': '00000000',
      'w:rsidP': '00000000',
      'w:rsidRDefault': '00000000',
      'w:rsidRPr': '00000000',
      'w14:paraId': utils.getRandomParaId(),
    });
   
    // gambiarra
    const mockTextRun = new TextRun({
      size: 24,
      font: {
        name: 'Times New Roman',
      },
    });
    
    const paragraph = new Paragraph({
      children: wordRuns,
      style: 'Normal',
      spacing: {
        after: 0,
        line: 360,
        lineRule: 'auto',
      },
      indent: {
        firstLine: 708,
      },
    });
  
    paragraph.properties.root.push(mockTextRun.properties);
    paragraph.root.push(paragraphAttributes);
  
    return xml(Packer.compiler.formatter.format(paragraph), true);
  }
};

DocxSections[Template.SHUNN_MANUSCRIPT] = {
  newWordRun(text, italics) {
    const runAttributes = new XmlAttributeComponent({
      'w:rsidR': '00887836',
    });
  
    const textRun = new TextRun({
      text,
      italics,
    });
  
    textRun.root.push(runAttributes);
  
    return textRun;
  },
  
  newParagraph(wordRuns) {
    const paragraphAttributes = new XmlAttributeComponent({
      'w:rsidR': '00887836',
      'w:rsidP': '00887836',
      'w:rsidRDefault': '006B37B5',
      'w14:paraId': utils.getRandomParaId(),
    });
    
    // <w:r>
    //     <w:tab />
    // </w:r>
    const tr = new TextRun({});
    tr.root.push({ 'w:tab': undefined });
    wordRuns.unshift(tr);

    const paragraph = new Paragraph({
      children: wordRuns,
      style: 'msText',
    });
  
    paragraph.root.push(paragraphAttributes);

    return xml(Packer.compiler.formatter.format(paragraph), true);
  }
};

DocxSections[Template.TRASGO] = {
  newWordRun(text, italics) {
    const textRun = new TextRun({
      font: {
        name: 'Arial',
      },
      text,
      italics,
      size: 22,
    });
  
    return textRun;
  },
  
  newParagraph(wordRuns) {
    const paragraphAttributes = new XmlAttributeComponent({
      'w:rsidR': '00B748F9',
      'w:rsidRDefault': '003B7B5B',
      'w:rsidRPr': '003B7B5B',
      'w14:paraId': utils.getRandomParaId(),
    });
    
    const paragraph = new Paragraph({
      children: wordRuns,
      style: 'TextBody',
      spacing: {
        after: 0,
      },
      indent: {
        firstLine: 720,
      },
    });
  
    paragraph.root.push(paragraphAttributes);
  
    return xml(Packer.compiler.formatter.format(paragraph), true);
  }
};

/**
 * Creates a new word run based on the requested template.
 * @param {Template} templateId template id
 * @param {String} text the text to be wrapped in a word run
 * @param {Boolean} italics if this word run should be in italics
 * @throws {Errors.EXPORT_INVALID_TEMPLATE_ERROR} in case the provided templateId does
 *    not match any of the available templates
 */
function newWordRun(templateId, text, italics) {
  if (!Object.keys(DocxSections).includes(templateId)) {
    throw new Error(Errors.EXPORT_INVALID_TEMPLATE_ERROR);
  }

  return DocxSections[templateId].newWordRun(text, italics);
}

/**
 * Creates a new paragraph based on the requested template.
 * @param {Template} templateId template id
 * @param {TextRun[]} wordRuns an array containing docx's TextRun objects
 * @throws {Errors.EXPORT_INVALID_TEMPLATE_ERROR} in case the provided templateId does
 *    not match any of the available templates
 */
function newParagraph(templateId, wordRuns) {
  if (!Object.keys(DocxSections).includes(templateId)) {
    throw new Error(Errors.EXPORT_INVALID_TEMPLATE_ERROR);
  }

  return DocxSections[templateId].newParagraph(wordRuns);
}

module.exports = {
  newWordRun,
  newParagraph,
};
