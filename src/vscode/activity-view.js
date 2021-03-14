const fs = require('fs');
const vscode = require('vscode');

class ActivityChartViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
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
      enableCommandUris: this._extensionUri,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.updateActivityChart();
  }

  updateActivityChart() {    
    if (this.view && this.view.visible) {
      this.view.webview.postMessage({
        type: 'activityHistory',
        data: [{
          "date": "2021-01-01",
          "total": 17164,
          "details": [{
              "name": "Project 1",
              "date": "2021-01-01 12:30:45",
              "value": 9192
            }, {
              "name": "Project 2",
              "date": "2021-01-01 13:37:00",
              "value": 6753
            },
            {
              "name": "Project N",
              "date": "2021-01-01 17:52:41",
              "value": 1219
            }]
        }, {
          "date": "2021-01-01",
          "total": 17164,
          "details": [{
              "name": "Project 1",
              "date": "2021-01-02 12:30:45",
              "value": 9192
            }, {
              "name": "Project 2",
              "date": "2021-01-02 13:37:00",
              "value": 6753
            }],
          }
        ],
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
    const mainScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'main.js'));
    const d3ScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'd3.min.js'));
    const momentScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'moment.min.js'));
    const calendarHeatmapScriptUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'calendar-heatmap.min.js'));
    const calendarHeatmapCssUri = webviewView.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'calendar-heatmap.min.css'));
    const nonce = getNonce();

    const htmlFilePath = vscode.Uri.joinPath(this._extensionUri, 'media', 'activity_view', 'main.html');
    let htmlFileContent = fs.readFileSync(htmlFilePath.fsPath).toString('utf-8');
    
    htmlFileContent = htmlFileContent.replace(/\${cspSource}/g, webviewView.cspSource);
    htmlFileContent = htmlFileContent.replace(/\${nonce}/g, nonce);
    htmlFileContent = htmlFileContent.replace(/\${main.js}/, mainScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${d3.min.js}/, d3ScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${moment.min.js}/, momentScriptUri);
    htmlFileContent = htmlFileContent.replace(/\${calendar-heatmap.min.js}/, calendarHeatmapScriptUri);
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
