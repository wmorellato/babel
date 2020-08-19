const { encrypt, decrypt } = require('../../src/crypto');
const {
  expect
} = require('chai');

suite('crypto functions test', function () {
  const data = { foo: 'bar' };

  test('should encrypt and decrypt data', async function () {
    const ct = await encrypt(JSON.stringify(data), 'password');
    const pt = await decrypt(ct, 'password');

    expect(JSON.parse(pt.toString('utf-8'))).to.be.eql(data);
  });
});