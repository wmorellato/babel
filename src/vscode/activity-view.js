const fs = require('fs');
const vscode = require('vscode');
const {
  BabelDb
} = require('../database');

class ActivityChartViewProvider {
  constructor(extensionUri, workspaceDirectory) {
    this.extensionUri = extensionUri;
    this.workspaceDirectory = workspaceDirectory;
    this.db = new BabelDb(this.workspaceDirectory);
  }

  /**
   * 
   * @param {vscode.WebviewView} webviewView view being resolved
   * @param {vscode.WebviewViewResolveContext} context metadata of the view being resolved
   * @param {vscode.CancellationToken} token cancellation token
   */
  resolveWebviewView(webviewView, context, token) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: this.extensionUri,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.updateActivityChart();
  }

  updateActivityChart() {
    const actHistory = this.db.getActivityHistory();
    actHistory.forEach(element => {
      element.total = element.entries.reduce((acc, entry) => acc + entry.wordCount, 0);
      element.details = element.entries.map((entry) => {
        const storyTitle = this.db.getStoryById(entry.storyId).title;
        return { name: storyTitle, date: element.date, value: entry.wordCount }
      });
    });

    if (this.view && this.view.visible) {
      this.view.webview.postMessage({
        type: 'activityHistory',
        data: actHistory,
      });
    }
  }

  /**
   * Read the html template file and updates it using URLs provided by
   * VSCode.
   * @param {vscode.Webview} webviewView webview instance being resolved
   * @returns {string} html content
   */
  getHtml(webviewView) {
    const mainScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'main.js'));
    const d3ScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'd3.min.js'));
    const momentScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'moment.min.js'));
    const calendarHeatmapScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'calendar-heatmap.js'));
    const calendarHeatmapCssUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'calendar-heatmap.min.css'));
    const nonce = getNonce();

    const htmlFilePath = vscode.Uri.joinPath(this.extensionUri, 'media', 'activity_view', 'main.html');
    let htmlFileContent = fs.readFileSync(htmlFilePath.fsPath).toString('utf-8');

    htmlFileContent = htmlFileContent.replace(/\${cspSource}/g, webviewView.cspSource);
    htmlFileContent = htmlFileContent.replace(/\${nonce}/g, nonce);
    htmlFileContent = htmlFileContent.replace(/\${main.js}/, mainScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${d3.min.js}/, d3ScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${moment.min.js}/, momentScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${calendar-heatmap.js}/, calendarHeatmapScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${calendar-heatmap.min.css}/, calendarHeatmapCssUri);

    return htmlFileContent;
  }

  get viewType() {
    return 'babel.activityChartView';
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

module.exports = {
  ActivityChartViewProvider,
};