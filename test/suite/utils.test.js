const utils = require('../../src/utils');
const { expect } = require('chai');

suite('utils tests', function () {
    test('should normalize filenames', function () {
        expect(utils.titleToFilename('  The death of  sleep')).to.be.equal('the_death_of_sleep');
        expect(utils.titleToFilename(' Mail Services of Mrs. Rizzuto.')).to.be.equal('mail_services_of_mrs._rizzuto.');
    });
});
