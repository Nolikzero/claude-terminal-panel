import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';

// Webview message types
interface WebviewMessage {
  type: 'ready' | 'input' | 'resize';
  cols?: number;
  rows?: number;
  data?: string;
}

// node-pty types
interface IPty {
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: { exitCode: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

interface INodePty {
  spawn: (
    file: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: { [key: string]: string | undefined };
    }
  ) => IPty;
}

interface TerminalConfig {
  command: string;
  args: string[];
  autoRun: boolean;
  shell: string;
  env: { [key: string]: string };
  directMode: boolean;
}

export class ClaudeTerminalViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _pty?: IPty;
  private _nodePty?: INodePty;
  private _disposed = false;
  private _isRestarting = false;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      switch (message.type) {
        case 'ready':
          this._startTerminal(message.cols ?? 80, message.rows ?? 24);
          break;
        case 'input':
          if (message.data) {
            this._pty?.write(message.data);
          }
          break;
        case 'resize':
          if (message.cols !== undefined && message.rows !== undefined) {
            this._pty?.resize(message.cols, message.rows);
          }
          break;
      }
    });

    webviewView.onDidDispose(() => {
      this._killPty();
    });
  }

  private _startTerminal(cols: number = 80, rows: number = 24): void {
    this._killPty();

    try {
      // Dynamic import of node-pty
      if (!this._nodePty) {
        this._nodePty = require('node-pty') as INodePty;
      }

      const config = this._getConfig();
      const shell = config.shell || this._getDefaultShell();
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

      // Verify cwd exists
      const actualCwd = fs.existsSync(cwd) ? cwd : os.homedir();

      const env: { [key: string]: string } = {};
      // Copy process.env, filtering out undefined values
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      // Add config env and terminal settings
      Object.assign(env, config.env, {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        CI: undefined // Ensure Claude doesn't think it's in CI
      });
      delete env.CI;

      // Direct mode: spawn command directly, no shell
      // Shell mode: spawn shell and run command in it
      if (config.directMode && config.command) {
        this._pty = this._nodePty.spawn(config.command, config.args, {
          name: 'xterm-256color',
          cols: cols,
          rows: rows,
          cwd: actualCwd,
          env: env
        });
      } else {
        this._pty = this._nodePty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: cols,
          rows: rows,
          cwd: actualCwd,
          env: env
        });
      }

      this._pty.onData((data: string) => {
        if (!this._disposed && this._view) {
          this._view.webview.postMessage({ type: 'output', data });
        }
      });

      this._pty.onExit(({ exitCode }) => {
        if (!this._disposed && this._view && !this._isRestarting) {
          this._view.webview.postMessage({
            type: 'output',
            data: `\r\n[Process exited with code ${String(exitCode)}]\r\n`
          });
        }
      });

      // Auto-run command in shell mode
      if (!config.directMode && config.autoRun && config.command) {
        const fullCommand = [config.command, ...config.args].join(' ');
        // Clear screen and run command
        this._pty.write('clear && ' + fullCommand + '\r');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._view?.webview.postMessage({
        type: 'output',
        data: `\r\nError starting terminal: ${errorMessage}\r\n`
      });
    }
  }

  private _getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  private _getConfig(): TerminalConfig {
    const config = vscode.workspace.getConfiguration('claudeTerminal');
    return {
      command: config.get<string>('command', 'claude'),
      args: config.get<string[]>('args', []),
      autoRun: config.get<boolean>('autoRun', true),
      shell: config.get<string>('shell', ''),
      env: config.get<{ [key: string]: string }>('env', {}),
      directMode: config.get<boolean>('directMode', true)
    };
  }

  private _killPty(): void {
    if (this._pty) {
      try {
        this._pty.kill();
      } catch {
        // Ignore errors when killing
      }
      this._pty = undefined;
    }
  }

  public restart(): void {
    this._isRestarting = true;
    this.clear();
    this._killPty();
    // Delay to let old PTY exit event fire before resetting flag
    setTimeout(() => {
      this._isRestarting = false;
    }, 100);
    this._startTerminal();
  }

  public clear(): void {
    this._view?.webview.postMessage({ type: 'clear' });
  }

  public updateConfig(): void {
    // Config will be read on next restart
  }

  public dispose(): void {
    this._disposed = true;
    this._killPty();
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );

    const nonce = this._getNonce();

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
    <div id="terminal-container"></div>
    <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js" integrity="sha384-/nfmYPUzWMS6v2atn8hbljz7NE0EI1iGx34lJaNzyVjWGDzMv+ciUZUeJpKA3Glc" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js" integrity="sha384-AQLWHRKAgdTxkolJcLOELg4E9rE89CPE2xMy3tIRFn08NcGKPTsELdvKomqji+DL" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js" integrity="sha384-U4fBROT3kCM582gaYiNaOSQiJbXPzd9SfR1598Y7yeGSYVBzikXrNg0XyuU+mOnl" crossorigin="anonymous"></script>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
