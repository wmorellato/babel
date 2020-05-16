const FileExtension = {
  DOCX: '.docx',
  PDF: '.pdf',
}

const Template = {
  SHUNN_MANUSCRIPT: {
    id: 'shunn',
    name: 'Shunn Manuscript Format (Story Manuscript)',
    url: 'https://www.shunn.net/format/templates.html',
    path: 'resources/templates/shunn.docx',
    fields: ['author', 'author_surname', 'title_keyword', 'address', 'city_postal', 'phone', 'email', 'title', 'word_count', 'content'],
    fileFormat: FileExtension.DOCX,
    fileNameFormatter (storyDescriptor) {
      return `${storyDescriptor.title} (Shunn)${this.fileFormat}`;
    },
  },
  MAFAGAFO_FAISCA: {
    id: 'mafagafo-faisca',
    name: 'Mafagafo - Submissão Faísca',
    url: 'https://mafagaforevista.com.br/submissoesfaisca/',
    path: 'resources/templates/mafagafo-faisca.docx',
    fields: ['author', 'email', 'title', 'word_count', 'content'],
    fileFormat: FileExtension.DOCX,
    fileNameFormatter (storyDescriptor) {
      return `Submissão Faísca - ${storyDescriptor.title} - ${storyDescriptor.author}${this.fileFormat}`;
    },
  },
  TRASGO: {
    id: 'trasgo',
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
};

module.exports = {
  Template,
};
