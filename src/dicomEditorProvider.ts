import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'crypto';
import { DicomDocument } from './dicomDocument';
import { ExtToWebviewMessage, HighlightData, NoteData, WebviewToExtMessage } from './common/protocol';
import { isValidWebviewMessage } from './messageValidation';
import { FileIdentity, NotesStore, computeContentHash, resolveIdentity } from './notesStore';

function getNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * In-memory notes for one file identity, shared by every open editor that resolves to it (e.g. copies
 * of a file with the same SOP Instance UID), so one editor's edits can't be overwritten by another's.
 */
interface RuntimeNotes {
  identity: FileIdentity;
  notes: Record<string, NoteData>;
  highlights: HighlightData[];
  palette: string[];
  /** JSON snapshot of notes/highlights/palette as last persisted, used to roll back a failed save. */
  savedState: string;
  /** Content hash recorded in the notes file, used to compute per-editor drift. */
  storedContentHash: string | undefined;
  /**
   * Webviews showing these notes (all are notified on every change), each mapped to whether its file had
   * drifted from the stored hash when it opened (undefined until computed). The flag is kept for the
   * editor's lifetime so a later save, which records the new hash, doesn't silently hide the warning.
   */
  webviews: Map<vscode.Webview, boolean | undefined>;
  /** Serializes saves across all editors sharing these notes. */
  saveQueue: Promise<void>;
}

function snapshotNotes(runtime: Pick<RuntimeNotes, 'notes' | 'highlights' | 'palette'>): string {
  return JSON.stringify({ notes: runtime.notes, highlights: runtime.highlights, palette: runtime.palette });
}

export class DicomEditorProvider implements vscode.CustomReadonlyEditorProvider<DicomDocument> {
  public static readonly viewType = 'dicomDump.viewer';

  private readonly notesStore: NotesStore;
  /** Shared notes keyed by identity; an entry lives while at least one editor is attached to it. */
  private readonly notesSessions = new Map<
    string,
    { webviews: Map<vscode.Webview, boolean | undefined>; runtime: Promise<RuntimeNotes> }
  >();

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
    if (document.warning) {
      void vscode.window.showWarningMessage(document.warning);
    }

    let runtimeNotes: RuntimeNotes | undefined;
    const contentHash = computeContentHash(document.bytes);
    const identity = resolveIdentity(document.sopInstanceUid, contentHash);
    panel.onDidDispose(() => this.releaseNotes(identity, panel.webview));

    const handleMessage = async (message: WebviewToExtMessage): Promise<void> => {
      switch (message.type) {
        case 'ready':
          runtimeNotes = await this.sendInitialState(document, panel.webview, identity, contentHash);
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
          await this.persistAndNotify(runtimeNotes, contentHash);
          break;
        }
        case 'clearNote': {
          if (!runtimeNotes) {
            break;
          }
          delete runtimeNotes.notes[message.noteKey];
          await this.persistAndNotify(runtimeNotes, contentHash);
          break;
        }
        case 'addPaletteColor': {
          if (!runtimeNotes || runtimeNotes.palette.includes(message.color)) {
            break;
          }
          runtimeNotes.palette.push(message.color);
          await this.persistAndNotify(runtimeNotes, contentHash);
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
          await this.persistAndNotify(runtimeNotes, contentHash);
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
          await this.persistAndNotify(runtimeNotes, contentHash);
          break;
        }
        case 'deleteHighlight': {
          if (!runtimeNotes) {
            break;
          }
          runtimeNotes.highlights = runtimeNotes.highlights.filter((h) => h.id !== message.id);
          await this.persistAndNotify(runtimeNotes, contentHash);
          break;
        }
      }
    };

    // Handle messages one at a time, so a later save can't finish before an earlier one and leave stale notes on disk.
    let messageQueue: Promise<void> = Promise.resolve();
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isValidWebviewMessage(message)) {
        console.warn('DICOM viewer: ignoring malformed webview message', message);
        return;
      }
      messageQueue = messageQueue
        .then(() => handleMessage(message))
        .catch((err) => console.error('DICOM viewer: failed to handle webview message', err));
    });
  }

  private async persistAndNotify(runtime: RuntimeNotes, contentHash: string): Promise<void> {
    const saved = runtime.saveQueue.then(async () => {
      try {
        await this.notesStore.save(runtime.identity, contentHash, runtime.notes, runtime.highlights, runtime.palette);
        runtime.savedState = snapshotNotes(runtime);
        runtime.storedContentHash = contentHash;
      } catch (err) {
        // Roll back to the last saved state so the UI doesn't show edits that aren't on disk.
        Object.assign(runtime, JSON.parse(runtime.savedState));
        const reason = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Failed to save DICOM notes: ${reason}`);
      }
      for (const [webview, contentDrift] of runtime.webviews) {
        const message: ExtToWebviewMessage = {
          type: 'notesUpdate',
          notes: {
            notes: runtime.notes,
            highlights: runtime.highlights,
            palette: runtime.palette,
            contentDrift: contentDrift ?? false,
          },
        };
        webview.postMessage(message);
      }
    });
    runtime.saveQueue = saved;
    await saved;
  }

  private notesSessionKey(identity: FileIdentity): string {
    return `${identity.kind}:${identity.value}`;
  }

  /** Attaches a webview to the shared notes for an identity, loading them from disk on first use. */
  private acquireNotes(identity: FileIdentity, contentHash: string, webview: vscode.Webview): Promise<RuntimeNotes> {
    const key = this.notesSessionKey(identity);
    let session = this.notesSessions.get(key);
    if (!session) {
      const webviews = new Map<vscode.Webview, boolean | undefined>();
      const runtime = this.notesStore.load(identity, contentHash).then((loaded): RuntimeNotes => {
        if (loaded.warning) {
          void vscode.window.showWarningMessage(loaded.warning);
        }
        return {
          identity,
          notes: loaded.notes,
          highlights: loaded.highlights,
          palette: loaded.palette,
          savedState: snapshotNotes(loaded),
          storedContentHash: loaded.storedContentHash,
          webviews,
          saveQueue: Promise.resolve(),
        };
      });
      session = { webviews, runtime };
      this.notesSessions.set(key, session);
    }
    if (!session.webviews.has(webview)) {
      session.webviews.set(webview, undefined);
    }
    return session.runtime;
  }

  private releaseNotes(identity: FileIdentity, webview: vscode.Webview): void {
    const key = this.notesSessionKey(identity);
    const session = this.notesSessions.get(key);
    if (session?.webviews.delete(webview) && session.webviews.size === 0) {
      this.notesSessions.delete(key);
    }
  }

  private async sendInitialState(
    document: DicomDocument,
    webview: vscode.Webview,
    identity: FileIdentity,
    contentHash: string,
  ): Promise<RuntimeNotes | undefined> {
    if (document.error) {
      const message: ExtToWebviewMessage = { type: 'parseError', message: document.error };
      webview.postMessage(message);
      return undefined;
    }

    const runtime = await this.acquireNotes(identity, contentHash, webview);
    let contentDrift = runtime.webviews.get(webview);
    if (contentDrift === undefined) {
      contentDrift = runtime.storedContentHash !== undefined && runtime.storedContentHash !== contentHash;
      runtime.webviews.set(webview, contentDrift);
    }

    const message: ExtToWebviewMessage = {
      type: 'model',
      elements: document.elements ?? [],
      notes: {
        notes: runtime.notes,
        highlights: runtime.highlights,
        palette: runtime.palette,
        contentDrift,
      },
    };
    webview.postMessage(message);

    return runtime;
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
