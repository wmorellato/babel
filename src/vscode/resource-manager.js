const path = require('path');
const vscode = require('vscode');

let extensionContext = undefined;

function init(context) {
  extensionContext = context;
}

function getResourcePathByName(resourceRelativePath) {
  let resourcePath = undefined;

  if (extensionContext) {
    resourcePath = vscode.Uri.file(path.join(extensionContext.extensionPath, resourceRelativePath));
  }

  return resourcePath;
}

module.exports = {
  init,
  getResourcePathByName,
};
