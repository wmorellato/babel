const os = require('os');
const fs = require('fs');
const path = require('path');
const resources = require('../../src/vscode/resource-manager');
const { Exporter } = require('../../src/exporter');
const { Template, getDescriptorById } = require('../../src/exporter/templates');
const { expect } = require('chai');
const Errors = require('../../src/errors');

suite('exporter tests', function () {
  const story_descriptor = {
    author: 'Jorge Luis Borges',
    author_surname: 'Borges',
    title_keyword: 'Babel',
    address: 'Buenos Aires, Argentina',
    city_postal: '642-2054',
    phone: '123456',
    email: 'borges@uqbar.com',
    title: 'A Biblioteca de Babel',
    word_count: 198798,
    content: 'O universo (que outros chamam a Biblioteca) compõe-se de um número indefinido, e talvez infinito, de galerias hexagonais, com vastos poços de ventilação no centro, cercados por balaustradas baixíssimas. De qualquer hexágono, vêem-se os andares inferiores e superiores: interminavelmente. A distribuição das galerias é invariável. Vinte prateleiras, em cinco longas estantes de cada lado, cobrem todos os lados menos dois; sua altura, que é a dos andares, excede apenas a de um bibliotecário normal. Uma das faces livres dá para um estreito vestíbulo, que desemboca em outra galeria, idêntica à primeira e a todas. A esquerda e à direita do vestíbulo, há dois sanitários minúsculos. Um permite dormir em pé; outro, satisfazer as necessidades físicas. Por aí passa a escada espiral, que se abisma e se eleva ao infinito. No vestíbulo há um espelho, que fielmente duplica as aparências. Os homens costumam inferir desse espelho que a Biblioteca não é infinita (se o fosse realmente, para que essa duplicação ilusória?), prefiro sonhar que as superfícies polidas representam e prometem o infinito… A luz procede de algumas frutas esféricas que levam o nome de lâmpadas. Há duas em cada hexágono: transversais. A luz que emitem é insuficiente, incessante.',
  };
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));

  this.beforeAll(function () {
    resources.init({
      extensionPath: path.join(__dirname, '..', '..'),
    });
  });

  test('should get all templates', function () {
    const availableTemplates = Exporter.getAvailableTemplates();

    expect(Object.keys(availableTemplates)).to.be.eql(Object.values(Template));
  });

  test('should create docx using Faisca format', async function () {
    const exporter = new Exporter(outputPath, story_descriptor);
    await exporter.export(Template.MAFAGAFO_FAISCA);

    const docxPath = path.join(outputPath, getDescriptorById(Template.MAFAGAFO_FAISCA).fileNameFormatter(story_descriptor));
    expect(fs.existsSync(docxPath)).to.be.equal(true);
  });

  test('should fail to create docx', function (done) {
    const exporter = new Exporter('a random output path', story_descriptor);

    exporter.export(Template.SHUNN_MANUSCRIPT)
      .catch((err) => {
        expect(err.code).to.be.equal('ENOENT');
        done();
      });
  });

  test('should get metadata from template', function () {
    let metadataText = Exporter.getMetadataFromTemplate(Template.SHUNN_MANUSCRIPT, { title: 'Viagem', author: 'Cecilia Meireles', email: 'cecilia.meireles@abl.org', country: 'Brasil' });
    expect(metadataText).to.be.equal('---\ntitle: "Viagem"\nauthor: "Cecilia Meireles"\nauthor_surname: ""\ntitle_keyword: ""\naddress: ""\ncity_postal: ""\nphone: ""\nemail: "cecilia.meireles@abl.org"\ncountry: "Brasil"\n---\n\n');

    metadataText = Exporter.getMetadataFromTemplate(Template.MAFAGAFO_FAISCA, { title: 'Viagem', author: 'Cecilia Meireles', email: 'cecilia.meireles@abl.org', country: 'Brasil' });
    expect(metadataText).to.be.equal('---\ntitle: "Viagem"\nauthor: "Cecilia Meireles"\nemail: "cecilia.meireles@abl.org"\ncountry: "Brasil"\n---\n\n');
  });
});
