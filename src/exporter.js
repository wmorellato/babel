const docxBuilder = require('./exporter/docx/builder');
const Errors = require('./errors');
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
   * Create a Markdown metadata header to be placed on top of files.
   * @param {Template} templateId the template which fields will be used to
   *    create the metadata text
   * @param {Object} defaultValues default values to be used when generating
   *    the header. Mostly these values will be read from Settings.
   * @throws EXPORT_INVALID_TEMPLATE_ERROR if the the templateId is invalid
   * @return the markdown metadata text with empty fields
   */
  static getMetadataFromTemplate(templateId, defaultValues) {
    let metadataText;
    // title will be placed first
    const excludeFields = ['title', 'word_count', 'content'];
    const templateDescriptor = getDescriptorById(templateId);

    if (!templateDescriptor) {
      throw new Error(Errors.EXPORT_INVALID_TEMPLATE_ERROR);
    }

    if (!defaultValues) {
      defaultValues = {};
    }

    metadataText = '---\n';
    metadataText += `title: "${defaultValues['title'] || ''}"\n`;
    templateDescriptor.fields.forEach((f) => {
      if (excludeFields.includes(f)) {
        return;
      }

      metadataText += `${f}: "${defaultValues[f] || ''}"\n`;
    });
    metadataText += `country: "${defaultValues['country'] || ''}"\n`;
    metadataText += '---\n\n';

    return metadataText;
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
