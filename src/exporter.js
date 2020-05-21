const docxBuilder = require('./exporter/docx/builder');
const { TemplateDescriptors, FileExtension, getDescriptorById } = require('./exporter/templates');

class Exporter {
  /**
   * @param {String} outputPath the path to save the file
   * @param {Object} storyDescriptor a story describing the story
   */
  constructor(outputPath, storyDescriptor) {
    this.outputPath = outputPath;
    this.storyDescriptor = storyDescriptor;
  }

  /**
   * Get the available templates with their user friendly names.
   * @return {Object} contains id and name for each template
   */
  static getAvailableTemplates() {
    const templates = {};

    TemplateDescriptors.forEach((t) => {
      templates[t.id] = t.name;
    });

    return templates;
  }

  /**
   * Call the chain of functions to export the story to the desired
   * template.
   * @param {Template} templateId to which template the story will be exported
   */
  export(templateId) {
    const descriptor = getDescriptorById(templateId);

    switch (descriptor.fileFormat) {
      case FileExtension.DOCX:
        return docxBuilder.createDocxDocument(descriptor, this.storyDescriptor, this.outputPath);
    }    
  }
}

module.exports = {
  Exporter,
};
