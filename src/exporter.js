const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const Docxtemplater = require('docxtemplater');
const util = require('util');
const Errors = require('./errors');
const resources = require('./vscode/resource-manager');

const readFilePromise = util.promisify(fs.readFile);
const writeFilePromise = util.promisify(fs.writeFile);

class Exporter {
  /**
   * 
   * @param {*} outputPath 
   * @param {Object} storyDescriptor a story describing the story
   */
  constructor(outputPath, storyDescriptor) {
    this.outputPath = outputPath;
    this.storyDescriptor = storyDescriptor;
  }

  /**
   * Validate the story descriptor passed, throwing an Error in case any field
   * required by the template is missing.
   * @param {Template} template Template enum item describing one of the available templates
   * @param {Boolean} acceptMissing if the export operation should continue even with a field missing
   * @throws {Errors.EXPORT_INVALID_TEMPLATE_ERROR} if the provided template is invalid
   * @throws {Errors.EXPORT_MISSING_FIELD_ERROR} if any required field is missing
   */
  validateDescriptor(template, acceptMissing) {
    // improve this checking
    if (!template.name || !template.url || !template.path || !template.fields) {
      throw new Error(Errors.EXPORT_INVALID_TEMPLATE_ERROR);
    }

    template.fields.forEach((key) => {
      if (!this.storyDescriptor[key]) {
        if (!acceptMissing) {
          // improve this to show which field is missing
          throw new Error(Errors.EXPORT_MISSING_FIELD_ERROR);
        }
      }
    });
  }

  /**
   * Load the template binary contents.
   * @param {Template} template Template enum item describing one of the available templates
   */
  loadTemplateFile(template) {
    try {
      // trying to load the template using resources
      const absolutePath = resources.getResourcePathByName(template.path).fsPath;

      return readFilePromise(absolutePath);
    } catch (e) {
      throw new Error(Errors.EXPORT_TEMPLATE_LOADING_ERROR);
    }
  }

  /**
   * Replace the keys in the template by its corresponding fields in the
   * story descriptor.
   * @param {JSZip} plainTemplate JSZip object with template content inflated
   */
  fillTemplate(plainTemplate) {
    return new Promise((resolve) => {
      const doc = new Docxtemplater(plainTemplate);

      doc.setData(this.storyDescriptor);
      doc.render();
      
      const zipContent = doc.getZip().generate({type: 'nodebuffer', compression: "DEFLATE"});
      resolve(zipContent);
    });
  }

  /**
   * Function to export to .docx files.
   * @param {Template} template one of Template enum items
   */
  exportToDocx(template) {
    return this.loadTemplateFile(template)
      .then((data) => {
        const plainTemplate = new JSZip(data).load(data);
        return this.fillTemplate(plainTemplate);
      })
      .then((zippedTemplate) => {
        const filename = template.fileNameFormatter(this.storyDescriptor);
        const outputFile = path.join(this.outputPath, filename)
        
        return writeFilePromise(outputFile, zippedTemplate);
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  /**
   * Call the chain of functions to export the story to the desired
   * template.
   * @param {Template} template to which template the story will be exported
   */
  export(template) {
    this.validateDescriptor(template, true);

    switch (template.fileFormat) {
      case FileExtension.DOCX:
        return this.exportToDocx(template);
    }    
  }
}

module.exports = {
  Exporter,
  Template,
};
