const { Packer, File, Paragraph, TextRun, XmlAttributeComponent, AlignmentType } = require('docx');
const xml = require('xml');
const utils = require('../utils');

function newWordRun(text, italics) {
  const runAttributes = new XmlAttributeComponent({
    'w:rsidRPr': '16EC1DB2',
    'w:rsidR': '24171B82',
  });

  const textRun = new TextRun({
    text,
    italics,
    size: 24,
    font: {
      name: 'Times New Roman',
    },
  });

  textRun.root.push(runAttributes);

  return textRun;
}

function newParagraph(wordRuns) {
  const paragraphAttributes = new XmlAttributeComponent({
    'w:rsidR': '24171B82',
    'w:rsidP': '16EC1DB2',
    'w:rsidRDefault': '24171B82',
    'w14:paraId': utils.getRandomParaId(),
    'w14:textId': utils.getRandomParaId(),
  });

  const paragraph = new Paragraph({
    children: wordRuns,
    bidirectional: false,
    style: 'Normal',
    spacing: {
      after: 0,
      before: 0,
      line: 360,
      lineRule: 'auto',
      'w:beforeAutospacing': 'off',
      'w:afterAutospacing': 'off',
    },
    indent: {
      left: 0,
      right: 0,
      firstLine: 708,
    },
    alignment: AlignmentType.LEFT,
  });

  paragraph.root.push(paragraphAttributes);

  return xml(Packer.compiler.formatter.format(paragraph), true);
}

module.exports = {
  newWordRun,
  newParagraph,
};
