import * as vscode from 'vscode';
import { DicomEditorProvider } from './dicomEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(DicomEditorProvider.viewType, new DicomEditorProvider(context), {
      supportsMultipleEditorsPerDocument: false,
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
