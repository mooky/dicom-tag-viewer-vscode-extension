import * as vscode from 'vscode';
import { DicomEditorProvider } from './dicomEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(DicomEditorProvider.viewType, new DicomEditorProvider(context), {
      supportsMultipleEditorsPerDocument: false,
      // Keep the webview alive when its tab is hidden so expansion, selection and loaded hex survive tab
      // switches. Costs memory per hidden editor; the alternative is persisting that state via setState.
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
