import * as vscode from 'vscode';
import { DicomDocument } from './dicomDocument';
import { ExtToWebviewMessage, WebviewToExtMessage } from './common/protocol';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class DicomEditorProvider implements vscode.CustomReadonlyEditorProvider<DicomDocument> {
  public static readonly viewType = 'dicomDump.viewer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri): Promise<DicomDocument> {
    return DicomDocument.open(uri);
  }

  async resolveCustomEditor(document: DicomDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    panel.webview.html = this.getHtml(panel.webview);

    panel.webview.onDidReceiveMessage(async (message: WebviewToExtMessage) => {
      switch (message.type) {
        case 'ready':
          this.sendInitialState(document, panel.webview);
          break;
        case 'requestHex': {
          const bytes = document.readBytes(message.offset, message.length);
          if (bytes) {
            const post: ExtToWebviewMessage = {
              type: 'hexChunk',
              id: message.id,
              offset: message.offset,
              bytes: Buffer.from(bytes).toString('base64'),
            };
            panel.webview.postMessage(post);
          }
          break;
        }
        case 'copy':
          await vscode.env.clipboard.writeText(message.text);
          break;
      }
    });
  }

  private sendInitialState(document: DicomDocument, webview: vscode.Webview): void {
    if (document.error) {
      const message: ExtToWebviewMessage = { type: 'parseError', message: document.error };
      webview.postMessage(message);
      return;
    }
    const message: ExtToWebviewMessage = { type: 'model', elements: document.elements ?? [] };
    webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'));
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>DICOM Viewer</title>
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <input id="search" type="text" placeholder="Search tag, name, or value..." />
    </div>
    <div id="main">
      <div id="tree" tabindex="0"></div>
      <div id="detail"></div>
    </div>
    <div id="error" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
