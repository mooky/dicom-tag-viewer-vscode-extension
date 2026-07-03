import * as vscode from 'vscode';
import { DicomDocument } from './dicomDocument';
import { ExtToWebviewMessage, NoteData, WebviewToExtMessage } from './common/protocol';
import { FileIdentity, NotesStore, computeContentHash, resolveIdentity } from './notesStore';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

interface RuntimeNotes {
  identity: FileIdentity;
  contentHash: string;
  notes: Record<string, NoteData>;
  palette: string[];
}

export class DicomEditorProvider implements vscode.CustomReadonlyEditorProvider<DicomDocument> {
  public static readonly viewType = 'dicomDump.viewer';

  private readonly notesStore: NotesStore;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.notesStore = new NotesStore(context);
  }

  async openCustomDocument(uri: vscode.Uri): Promise<DicomDocument> {
    return DicomDocument.open(uri);
  }

  async resolveCustomEditor(document: DicomDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    panel.webview.html = this.getHtml(panel.webview);

    let runtimeNotes: RuntimeNotes | undefined;

    panel.webview.onDidReceiveMessage(async (message: WebviewToExtMessage) => {
      switch (message.type) {
        case 'ready':
          runtimeNotes = await this.sendInitialState(document, panel.webview);
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
        case 'setNote': {
          if (!runtimeNotes) {
            break;
          }
          runtimeNotes.notes[message.noteKey] = { color: message.color, text: message.text };
          if (!runtimeNotes.palette.includes(message.color)) {
            runtimeNotes.palette.push(message.color);
          }
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
        case 'clearNote': {
          if (!runtimeNotes) {
            break;
          }
          delete runtimeNotes.notes[message.noteKey];
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
        case 'addPaletteColor': {
          if (!runtimeNotes || runtimeNotes.palette.includes(message.color)) {
            break;
          }
          runtimeNotes.palette.push(message.color);
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
      }
    });
  }

  private async persistAndNotify(webview: vscode.Webview, runtime: RuntimeNotes): Promise<void> {
    await this.notesStore.save(runtime.identity, runtime.contentHash, runtime.notes, runtime.palette);
    const message: ExtToWebviewMessage = {
      type: 'notesUpdate',
      notes: { notes: runtime.notes, palette: runtime.palette, contentDrift: false },
    };
    webview.postMessage(message);
  }

  private async sendInitialState(document: DicomDocument, webview: vscode.Webview): Promise<RuntimeNotes | undefined> {
    if (document.error) {
      const message: ExtToWebviewMessage = { type: 'parseError', message: document.error };
      webview.postMessage(message);
      return undefined;
    }

    const contentHash = computeContentHash(document.bytes);
    const identity = resolveIdentity(document.sopInstanceUid, contentHash);
    const loaded = await this.notesStore.load(identity, contentHash);

    const message: ExtToWebviewMessage = {
      type: 'model',
      elements: document.elements ?? [],
      notes: { notes: loaded.notes, palette: loaded.palette, contentDrift: loaded.contentDrift },
    };
    webview.postMessage(message);

    return { identity, contentHash, notes: loaded.notes, palette: loaded.palette };
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
      <button id="notesToggle" type="button">Notes</button>
    </div>
    <div id="driftBanner" class="hidden"></div>
    <div id="main">
      <div id="tree" tabindex="0"></div>
      <div id="detail"></div>
      <div id="notesList" class="hidden"></div>
    </div>
    <div id="error" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
