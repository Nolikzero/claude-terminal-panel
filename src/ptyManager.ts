import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import type { IPty, INodePty, TerminalConfig } from './types';

/**
 * Callbacks for PTY events.
 */
export interface PtyEventCallbacks {
  onData: (terminalId: string, data: string) => void;
  onExit: (terminalId: string, exitCode: number) => void;
  onError: (terminalId: string, error: string) => void;
}

/**
 * Manages PTY process lifecycle.
 * Extracted from ClaudeTerminalViewProvider._startTerminalForInstance().
 */
export class PtyManager {
  private nodePty: INodePty | undefined;
  private readonly ptys = new Map<string, IPty>();

  constructor(private readonly callbacks: PtyEventCallbacks) {}

  /**
   * Spawns a new PTY process for the given terminal ID.
   * @param cwd Optional working directory. If not provided, uses default logic.
   */
  spawn(
    terminalId: string,
    config: TerminalConfig,
    cols: number,
    rows: number,
    cwd?: string
  ): void {
    // Kill existing PTY for this terminal if any
    this.kill(terminalId);

    try {
      this.ensureNodePtyLoaded();
      const { shell, env, cwd: defaultCwd } = this.prepareSpawnOptions(config);
      const workingDir = cwd ?? defaultCwd;
      const pty = this.createPty(config, shell, cols, rows, workingDir, env);

      this.ptys.set(terminalId, pty);
      this.setupPtyEventHandlers(terminalId, pty);
      this.handleAutoRun(pty, config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.callbacks.onError(terminalId, errorMessage);
    }
  }

  /**
   * Prompts the user to select a workspace folder if multiple are available.
   * Returns the selected folder path, or the default working directory if only one/none.
   */
  async selectWorkingDirectory(): Promise<string> {
    const folders = vscode.workspace.workspaceFolders;

    // If no folders or only one, use default behavior
    if (!folders || folders.length <= 1) {
      return this.getWorkingDirectory();
    }

    // Multiple workspace folders - let user choose
    const items = folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select workspace folder for Claude',
      title: 'Choose Working Directory'
    });

    if (selected) {
      return selected.folder.uri.fsPath;
    }

    // User cancelled - use first folder as default
    return folders[0].uri.fsPath;
  }

  private ensureNodePtyLoaded(): void {
    if (!this.nodePty) {
      this.nodePty = require('node-pty') as INodePty;
    }
  }

  private prepareSpawnOptions(config: TerminalConfig): {
    shell: string;
    env: Record<string, string>;
    cwd: string;
  } {
    const shell = config.shell || this.getDefaultShell();
    const cwd = this.getWorkingDirectory();
    const env = this.buildEnvironment(config.env);
    return { shell, env, cwd };
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  private getWorkingDirectory(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = workspaceFolder || os.homedir();
    return fs.existsSync(cwd) ? cwd : os.homedir();
  }

  private buildEnvironment(configEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};

    // Copy process.env, filtering undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Add config env and terminal settings
    Object.assign(env, configEnv, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1'
    });

    // Remove CI flag so Claude doesn't think it's in CI
    delete env.CI;

    return env;
  }

  private createPty(
    config: TerminalConfig,
    shell: string,
    cols: number,
    rows: number,
    cwd: string,
    env: Record<string, string>
  ): IPty {
    if (!this.nodePty) {
      throw new Error('node-pty not loaded');
    }

    const spawnOptions = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env
    };

    if (config.directMode && config.command) {
      return this.nodePty.spawn(config.command, config.args, spawnOptions);
    }
    return this.nodePty.spawn(shell, [], spawnOptions);
  }

  private setupPtyEventHandlers(terminalId: string, pty: IPty): void {
    pty.onData((data: string) => {
      this.callbacks.onData(terminalId, data);
    });

    pty.onExit(({ exitCode }) => {
      this.callbacks.onExit(terminalId, exitCode);
    });
  }

  private handleAutoRun(pty: IPty, config: TerminalConfig): void {
    if (!config.directMode && config.autoRun && config.command) {
      const fullCommand = [config.command, ...config.args].join(' ');
      // Clear screen and run command
      pty.write('clear && ' + fullCommand + '\r');
    }
  }

  /**
   * Writes data to the PTY.
   */
  write(terminalId: string, data: string): void {
    this.ptys.get(terminalId)?.write(data);
  }

  /**
   * Resizes the PTY.
   */
  resize(terminalId: string, cols: number, rows: number): void {
    this.ptys.get(terminalId)?.resize(cols, rows);
  }

  /**
   * Kills a specific PTY.
   */
  kill(terminalId: string): void {
    const pty = this.ptys.get(terminalId);
    if (pty) {
      try {
        pty.kill();
      } catch {
        // Ignore errors when killing
      }
      this.ptys.delete(terminalId);
    }
  }

  /**
   * Kills all PTYs.
   */
  killAll(): void {
    for (const terminalId of this.ptys.keys()) {
      this.kill(terminalId);
    }
  }
}
