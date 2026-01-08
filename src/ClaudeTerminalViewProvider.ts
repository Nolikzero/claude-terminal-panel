import * as vscode from 'vscode';
import { PtyManager, type PtyEventCallbacks } from './ptyManager';
import { ConfigManager } from './configManager';
import { TerminalStateManager } from './terminalStateManager';
import { dispatchMessage, type MessageHandlerContext } from './messageHandlers';
import type { WebviewMessage, TerminalInstance, ExtensionMessage } from './types';
import { WORKSPACE_ACCENT_COLORS } from './types';
import { CommandInputPicker } from './commandInputPicker';
import { PromptDetector, type PromptDetectorConfig } from './promptDetector';

export class ClaudeTerminalViewProvider
  implements vscode.WebviewViewProvider, MessageHandlerContext
{
  private view?: vscode.WebviewView;
  private disposed = false;
  private isRestarting = false;
  private lastCols = 80;
  private lastRows = 24;

  private readonly configManager = new ConfigManager();
  private readonly stateManager = new TerminalStateManager();
  private readonly ptyManager: PtyManager;
  private readonly commandPicker = new CommandInputPicker();
  private readonly promptDetector: PromptDetector;

  constructor(private readonly extensionUri: vscode.Uri) {
    const callbacks: PtyEventCallbacks = {
      onData: this.handlePtyData.bind(this),
      onExit: this.handlePtyExit.bind(this),
      onError: this.handlePtyError.bind(this)
    };
    this.ptyManager = new PtyManager(callbacks);

    // Initialize prompt detector for input waiting notifications
    this.promptDetector = new PromptDetector(
      this.getPromptDetectorConfig(),
      this.handleNotificationChange.bind(this)
    );

    // Pre-load help for CLI agents from README (missing commands are handled gracefully)
    const config = this.configManager.getConfig();
    this.commandPicker.preloadCommands([
      config.command,
      'claude',
      'gemini',
      'aider',
      'codex',
      'gh',
      'interpreter',
      'opencode'
    ]);
  }

  // --- MessageHandlerContext Implementation ---

  handleReady(cols: number, rows: number): void {
    this.lastCols = cols;
    this.lastRows = rows;
    void this.createTerminal();
  }

  handleInput(id: string, data: string): void {
    this.ptyManager.write(id, data);
    this.promptDetector.onUserInput(id);
  }

  handleResize(id: string, cols: number, rows: number): void {
    this.lastCols = cols;
    this.lastRows = rows;
    this.ptyManager.resize(id, cols, rows);
  }

  handleNewTab(): void {
    void this.createTerminal();
  }

  handleNewTabWithCommand(): void {
    void this.promptAndCreateTerminal();
  }

  handleCloseTab(id: string): void {
    this.closeTerminal(id);
  }

  handleSwitchTab(id: string): void {
    this.switchToTerminal(id);
  }

  // --- PTY Event Handlers ---

  private handlePtyData(terminalId: string, data: string): void {
    if (!this.disposed && this.view) {
      this.postMessage({ type: 'output', id: terminalId, data });
      this.promptDetector.onData(terminalId, data);
    }
  }

  private handlePtyExit(terminalId: string, exitCode: number): void {
    if (!this.disposed && this.view && !this.isRestarting) {
      this.postMessage({
        type: 'output',
        id: terminalId,
        data: `\r\n[Process exited with code ${String(exitCode)}]\r\n`
      });
    }
  }

  private handlePtyError(terminalId: string, error: string): void {
    this.postMessage({
      type: 'output',
      id: terminalId,
      data: `\r\nError starting terminal: ${error}\r\n`
    });
  }

  // --- WebviewViewProvider Implementation ---

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      dispatchMessage(message, this);
    });

    webviewView.onDidDispose(() => {
      this.ptyManager.killAll();
    });
  }

  // --- Terminal Management (Public API) ---

  public async createTerminal(): Promise<string> {
    const id = this.stateManager.generateId();
    const name = this.stateManager.generateName();

    // Select working directory first to get folder index
    const { path: cwd, folderIndex } = await this.ptyManager.selectWorkingDirectory();

    const instance: TerminalInstance = {
      id,
      name,
      pty: undefined,
      isActive: false,
      workspaceFolderIndex: folderIndex
    };

    // Add instance first, then activate (so setActive can find it)
    this.stateManager.set(id, instance);
    this.stateManager.setActive(id);

    // Notify webview with accent color
    const accentColor = this.getAccentColor(folderIndex);
    this.postMessage({ type: 'createTab', id, name, accentColor });
    this.sendTabsUpdate();

    // Start the terminal process
    const config = this.configManager.getConfig();
    this.ptyManager.spawn(id, config, this.lastCols, this.lastRows, cwd);

    // Switch to the new tab
    this.postMessage({ type: 'switchTab', id });

    return id;
  }

  private async promptAndCreateTerminal(): Promise<void> {
    const config = this.configManager.getConfig();
    const defaultCommand = [config.command, ...config.args].join(' ');

    const result = await this.commandPicker.promptForCommand(defaultCommand);

    if (!result.cancelled && result.command) {
      await this.createTerminalWithCommand(result.command, result.args);
    }
  }

  public async createTerminalWithCommand(command: string, args: string[]): Promise<string> {
    const id = this.stateManager.generateId();
    const name = this.stateManager.generateName();

    // Select working directory first to get folder index
    const { path: cwd, folderIndex } = await this.ptyManager.selectWorkingDirectory();

    const instance: TerminalInstance = {
      id,
      name,
      pty: undefined,
      isActive: false,
      workspaceFolderIndex: folderIndex
    };

    this.stateManager.set(id, instance);
    this.stateManager.setActive(id);

    const accentColor = this.getAccentColor(folderIndex);
    this.postMessage({ type: 'createTab', id, name, accentColor });
    this.sendTabsUpdate();

    // Use provided command/args instead of config
    const config = this.configManager.getConfig();
    const customConfig = { ...config, command, args };
    this.ptyManager.spawn(id, customConfig, this.lastCols, this.lastRows, cwd);

    this.postMessage({ type: 'switchTab', id });

    return id;
  }

  public closeTerminal(terminalId: string): void {
    const instance = this.stateManager.get(terminalId);
    if (!instance) return;

    this.ptyManager.kill(terminalId);
    this.promptDetector.removeTerminal(terminalId);
    this.stateManager.delete(terminalId);
    this.postMessage({ type: 'removeTab', id: terminalId });

    // Handle active terminal closure
    if (this.stateManager.getActiveId() === terminalId) {
      this.handleActiveTerminalClosed();
      return;
    }

    this.sendTabsUpdate();
  }

  private handleActiveTerminalClosed(): void {
    const remaining = this.stateManager.getAll();
    if (remaining.length > 0) {
      const newActive = remaining[remaining.length - 1];
      this.switchToTerminal(newActive.id);
    } else {
      this.stateManager.clearActive();
      void this.createTerminal();
      return;
    }
    this.sendTabsUpdate();
  }

  public closeActiveTerminal(): void {
    const activeId = this.stateManager.getActiveId();
    if (activeId) {
      this.closeTerminal(activeId);
    }
  }

  public switchToTerminal(terminalId: string): void {
    const instance = this.stateManager.get(terminalId);
    if (!instance) return;

    this.stateManager.setActive(terminalId);
    this.postMessage({ type: 'switchTab', id: terminalId });
    this.sendTabsUpdate();
  }

  public switchToNextTerminal(): void {
    const ids = this.stateManager.getAllIds();
    if (ids.length <= 1) return;

    const currentIndex = ids.indexOf(this.stateManager.getActiveId() ?? '');
    const nextIndex = (currentIndex + 1) % ids.length;
    this.switchToTerminal(ids[nextIndex]);
  }

  public switchToPreviousTerminal(): void {
    const ids = this.stateManager.getAllIds();
    if (ids.length <= 1) return;

    const currentIndex = ids.indexOf(this.stateManager.getActiveId() ?? '');
    const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
    this.switchToTerminal(ids[prevIndex]);
  }

  public restart(): void {
    const activeId = this.stateManager.getActiveId();
    if (!activeId) return;

    this.isRestarting = true;
    this.clear();
    this.ptyManager.kill(activeId);

    // Delay to let old PTY exit event fire before resetting flag
    setTimeout(() => {
      this.isRestarting = false;
    }, 100);

    const config = this.configManager.getConfig();
    this.ptyManager.spawn(activeId, config, this.lastCols, this.lastRows);
  }

  public clear(): void {
    const activeId = this.stateManager.getActiveId();
    if (activeId) {
      this.postMessage({ type: 'clear', id: activeId });
    }
  }

  public updateConfig(): void {
    this.configManager.invalidateCache();
    this.promptDetector.updateConfig(this.getPromptDetectorConfig());
  }

  public dispose(): void {
    this.disposed = true;
    this.ptyManager.killAll();
    this.promptDetector.dispose();
    this.configManager.dispose();
    this.commandPicker.dispose();
  }

  // --- Private Helpers ---

  private getPromptDetectorConfig(): PromptDetectorConfig {
    const vsConfig = vscode.workspace.getConfiguration('claudeTerminal');
    return {
      enabled: vsConfig.get<boolean>('promptNotification', true),
      showDelay: vsConfig.get<number>('promptNotificationDelay', 300),
      customPatterns: vsConfig.get<string[]>('promptPatterns', [])
    };
  }

  private handleNotificationChange(terminalId: string, isWaiting: boolean): void {
    this.stateManager.setWaitingForInput(terminalId, isWaiting);
    this.postMessage({ type: 'setNotification', id: terminalId, show: isWaiting });
  }

  private getAccentColor(folderIndex: number | undefined): string | undefined {
    if (folderIndex === undefined) {
      return undefined;
    }
    return WORKSPACE_ACCENT_COLORS[folderIndex % WORKSPACE_ACCENT_COLORS.length];
  }

  private postMessage(message: ExtensionMessage): void {
    this.view?.webview.postMessage(message);
  }

  private sendTabsUpdate(): void {
    const tabs = this.stateManager.getTabsInfo();
    this.postMessage({ type: 'tabsUpdate', tabs });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
    );
    const xtermCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'xterm.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${xtermCssUri.toString()}" rel="stylesheet">
    <link href="${stylesUri.toString()}" rel="stylesheet">
</head>
<body>
    <div id="terminals-container"></div>
    <div id="tab-bar"></div>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
