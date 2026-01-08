import * as vscode from 'vscode';
import { ClaudeTerminalViewProvider } from './ClaudeTerminalViewProvider';

let terminalProvider: ClaudeTerminalViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  terminalProvider = new ClaudeTerminalViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeTerminal.terminalView', terminalProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.restart', () => {
      terminalProvider?.restart();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.clear', () => {
      terminalProvider?.clear();
    })
  );

  // Multi-tab commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.newTab', () => {
      void terminalProvider?.createTerminal();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.closeTab', () => {
      terminalProvider?.closeActiveTerminal();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.nextTab', () => {
      terminalProvider?.switchToNextTerminal();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTerminal.previousTab', () => {
      terminalProvider?.switchToPreviousTerminal();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeTerminal')) {
        terminalProvider?.updateConfig();
      }
    })
  );
}

export function deactivate() {
  terminalProvider?.dispose();
}
