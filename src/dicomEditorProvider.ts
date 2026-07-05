import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { DicomDocument } from './dicomDocument';
import { ExtToWebviewMessage, HighlightData, NoteData, WebviewToExtMessage } from './common/protocol';
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
  highlights: HighlightData[];
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
        case 'createHighlight': {
          if (!runtimeNotes) {
            break;
          }
          runtimeNotes.highlights.push({
            id: randomUUID(),
            name: message.name,
            note: message.note,
            color: message.color,
            parentNoteKey: message.parentNoteKey,
            firstChildNoteKey: message.firstChildNoteKey,
            lastChildNoteKey: message.lastChildNoteKey,
            collapsed: false,
          });
          if (!runtimeNotes.palette.includes(message.color)) {
            runtimeNotes.palette.push(message.color);
          }
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
        case 'updateHighlight': {
          if (!runtimeNotes) {
            break;
          }
          const highlight = runtimeNotes.highlights.find((h) => h.id === message.id);
          if (!highlight) {
            break;
          }
          if (message.name !== undefined) {
            highlight.name = message.name;
          }
          if (message.note !== undefined) {
            highlight.note = message.note;
          }
          if (message.color !== undefined) {
            highlight.color = message.color;
            if (!runtimeNotes.palette.includes(message.color)) {
              runtimeNotes.palette.push(message.color);
            }
          }
          if (message.firstChildNoteKey !== undefined) {
            highlight.firstChildNoteKey = message.firstChildNoteKey;
          }
          if (message.lastChildNoteKey !== undefined) {
            highlight.lastChildNoteKey = message.lastChildNoteKey;
          }
          if (message.collapsed !== undefined) {
            highlight.collapsed = message.collapsed;
          }
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
        case 'deleteHighlight': {
          if (!runtimeNotes) {
            break;
          }
          runtimeNotes.highlights = runtimeNotes.highlights.filter((h) => h.id !== message.id);
          await this.persistAndNotify(panel.webview, runtimeNotes);
          break;
        }
      }
    });
  }

  private async persistAndNotify(webview: vscode.Webview, runtime: RuntimeNotes): Promise<void> {
    await this.notesStore.save(runtime.identity, runtime.contentHash, runtime.notes, runtime.highlights, runtime.palette);
    const message: ExtToWebviewMessage = {
      type: 'notesUpdate',
      notes: { notes: runtime.notes, highlights: runtime.highlights, palette: runtime.palette, contentDrift: false },
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
      notes: {
        notes: loaded.notes,
        highlights: loaded.highlights,
        palette: loaded.palette,
        contentDrift: loaded.contentDrift,
      },
    };
    webview.postMessage(message);

    return { identity, contentHash, notes: loaded.notes, highlights: loaded.highlights, palette: loaded.palette };
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
      <button id="highlightsToggle" type="button">Highlights</button>
    </div>
    <div id="driftBanner" class="hidden"></div>
    <div id="main">
      <div id="tree" tabindex="0"></div>
      <div id="detail"></div>
      <div id="notesList" class="hidden"></div>
      <div id="highlightsList" class="hidden"></div>
    </div>
    <div id="error" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
