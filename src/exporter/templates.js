const FileExtension = {
  DOCX: '.docx',
  PDF: '.pdf',
};

Object.freeze(FileExtension);

const Template = {
  SHUNN_MANUSCRIPT: 'shunn',
  MAFAGAFO_FAISCA: 'mafagafo-faisca',
  TRASGO: 'trasgo',
};

Object.freeze(Template);

const TemplateDescriptors = [
  {
    id: Template.SHUNN_MANUSCRIPT,
    name: 'Shunn Manuscript Format (Story Manuscript)',
    url: 'https://www.shunn.net/format/templates.html',
    path: 'resources/templates/shunn.docx',
    fields: ['author', 'author_surname', 'title_keyword', 'address', 'city_postal', 'phone', 'email', 'title', 'word_count', 'content'],
    fileFormat: FileExtension.DOCX,
    fileNameFormatter (storyDescriptor) {
      return `${storyDescriptor.title} (Shunn)${this.fileFormat}`;
    },
  },
  {
    id: Template.MAFAGAFO_FAISCA,
    name: 'Mafagafo - Submissão Faísca',
    url: 'https://mafagaforevista.com.br/submissoesfaisca/',
    path: 'resources/templates/mafagafo-faisca.docx',
    fields: ['author', 'email', 'title', 'word_count', 'content'],
    fileFormat: FileExtension.DOCX,
    fileNameFormatter (storyDescriptor) {
      return `Submissão Faísca - ${storyDescriptor.title} - ${storyDescriptor.author}${this.fileFormat}`;
    },
  },
  {
    id: Template.TRASGO,
    name: 'Trasgo',
    url: 'https://trasgo.com.br/envie-o-seu-material',
    path: 'resources/templates/trasgo.docx',
    fields: ['author', 'email', 'title', 'word_count', 'content'],
    italics: '',
    paragraph: '',
    fileFormat: FileExtension.DOCX,
    fileNameFormatter (storyDescriptor) {
      return `${storyDescriptor.title} (Trasgo)${this.fileFormat}`;
    },
  },
];

function getDescriptorById(templateId) {
  const descriptors = TemplateDescriptors.filter((td) => td.id === templateId);

  return descriptors[0];
}

module.exports = {
  Template,
  TemplateDescriptors,
  FileExtension,
  getDescriptorById,
};
