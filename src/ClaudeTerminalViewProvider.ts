import * as vscode from 'vscode';
import { PtyManager, type PtyEventCallbacks } from './ptyManager';
import { ConfigManager } from './configManager';
import { TerminalStateManager } from './terminalStateManager';
import { dispatchMessage, type MessageHandlerContext } from './messageHandlers';
import type { WebviewMessage, TerminalInstance, ExtensionMessage } from './types';

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

  constructor(private readonly extensionUri: vscode.Uri) {
    const callbacks: PtyEventCallbacks = {
      onData: this.handlePtyData.bind(this),
      onExit: this.handlePtyExit.bind(this),
      onError: this.handlePtyError.bind(this)
    };
    this.ptyManager = new PtyManager(callbacks);
  }

  // --- MessageHandlerContext Implementation ---

  handleReady(cols: number, rows: number): void {
    this.lastCols = cols;
    this.lastRows = rows;
    void this.createTerminal();
  }

  handleInput(id: string, data: string): void {
    this.ptyManager.write(id, data);
  }

  handleResize(id: string, cols: number, rows: number): void {
    this.lastCols = cols;
    this.lastRows = rows;
    this.ptyManager.resize(id, cols, rows);
  }

  handleNewTab(): void {
    void this.createTerminal();
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

    const instance: TerminalInstance = {
      id,
      name,
      pty: undefined,
      isActive: false
    };

    // Add instance first, then activate (so setActive can find it)
    this.stateManager.set(id, instance);
    this.stateManager.setActive(id);

    // Notify webview
    this.postMessage({ type: 'createTab', id, name });
    this.sendTabsUpdate();

    // Select working directory (prompts if multiple workspace folders)
    const cwd = await this.ptyManager.selectWorkingDirectory();

    // Start the terminal process
    const config = this.configManager.getConfig();
    this.ptyManager.spawn(id, config, this.lastCols, this.lastRows, cwd);

    // Switch to the new tab
    this.postMessage({ type: 'switchTab', id });

    return id;
  }

  public closeTerminal(terminalId: string): void {
    const instance = this.stateManager.get(terminalId);
    if (!instance) return;

    this.ptyManager.kill(terminalId);
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
  }

  public dispose(): void {
    this.disposed = true;
    this.ptyManager.killAll();
    this.configManager.dispose();
  }

  // --- Private Helpers ---

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
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://unpkg.com; script-src 'nonce-${nonce}' https://unpkg.com; font-src https://unpkg.com;">
    <link href="${stylesUri.toString()}" rel="stylesheet">
    <link href="https://unpkg.com/xterm@5.3.0/css/xterm.css" rel="stylesheet" integrity="sha384-LJcOxlx9IMbNXDqJ2axpfEQKkAYbFjJfhXexLfiRJhjDU81mzgkiQq8rkV0j6dVh" crossorigin="anonymous">
</head>
<body>
    <div id="terminals-container"></div>
    <div id="tab-bar"></div>
    <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js" integrity="sha384-/nfmYPUzWMS6v2atn8hbljz7NE0EI1iGx34lJaNzyVjWGDzMv+ciUZUeJpKA3Glc" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js" integrity="sha384-AQLWHRKAgdTxkolJcLOELg4E9rE89CPE2xMy3tIRFn08NcGKPTsELdvKomqji+DL" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js" integrity="sha384-U4fBROT3kCM582gaYiNaOSQiJbXPzd9SfR1598Y7yeGSYVBzikXrNg0XyuU+mOnl" crossorigin="anonymous"></script>
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
