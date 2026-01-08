import { spawn, ChildProcess } from 'child_process';
import { CommandHelpParser } from './commandHelpParser';
import { ParsedHelp } from './types';

export interface HelpExecutorOptions {
  timeout?: number;
  debounceMs?: number;
  cacheMaxAge?: number;
  cacheMaxSize?: number;
}

interface CacheEntry {
  result: ParsedHelp;
  timestamp: number;
}

export class HelpExecutor {
  private cache = new Map<string, CacheEntry>();
  private pendingRequests = new Map<string, Promise<ParsedHelp>>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private parser = new CommandHelpParser();
  private options: Required<HelpExecutorOptions>;

  constructor(options: HelpExecutorOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 5000,
      debounceMs: options.debounceMs ?? 300,
      cacheMaxAge: options.cacheMaxAge ?? 5 * 60 * 1000, // 5 minutes
      cacheMaxSize: options.cacheMaxSize ?? 50
    };
  }

  async getHelp(command: string): Promise<ParsedHelp> {
    // Check cache first
    const cached = this.cache.get(command);
    if (cached && Date.now() - cached.timestamp < this.options.cacheMaxAge) {
      return cached.result;
    }

    // Check if request already pending
    const pending = this.pendingRequests.get(command);
    if (pending) {
      return pending;
    }

    // Execute with timeout
    const promise = this.executeHelp(command);
    this.pendingRequests.set(command, promise);

    try {
      const result = await promise;
      this.updateCache(command, result);
      return result;
    } finally {
      this.pendingRequests.delete(command);
    }
  }

  getDebouncedHelp(command: string, callback: (result: ParsedHelp) => void): void {
    // Clear existing timer for this command
    const existingTimer = this.debounceTimers.get(command);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(command);
      this.getHelp(command)
        .then((result) => {
          callback(result);
        })
        .catch(() => {
          callback({ command, flags: [], parseErrors: ['Failed to get help'] });
        });
    }, this.options.debounceMs);

    this.debounceTimers.set(command, timer);
  }

  private executeHelp(command: string): Promise<ParsedHelp> {
    return new Promise((resolve) => {
      const helpFlags = ['--help', '-h', 'help'];
      let flagIndex = 0;

      const tryNextFlag = (): void => {
        if (flagIndex >= helpFlags.length) {
          resolve({
            command,
            flags: [],
            parseErrors: ['Command does not support --help']
          });
          return;
        }

        const flag = helpFlags[flagIndex++];
        let stdout = '';
        let stderr = '';
        let proc: ChildProcess | null = null;

        const timeoutId = setTimeout(() => {
          if (proc) {
            proc.kill('SIGTERM');
          }
          tryNextFlag();
        }, this.options.timeout);

        try {
          proc = spawn(command, [flag], {
            shell: true,
            env: { ...process.env, LANG: 'C', LC_ALL: 'C' }
          });
        } catch {
          clearTimeout(timeoutId);
          tryNextFlag();
          return;
        }

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('error', () => {
          clearTimeout(timeoutId);
          tryNextFlag();
        });

        proc.on('close', () => {
          clearTimeout(timeoutId);
          // Some commands output help to stderr, some exit with non-zero
          const output = stdout || stderr;
          if (output && output.length > 50) {
            resolve(this.parser.parse(command, output));
          } else {
            tryNextFlag();
          }
        });
      };

      tryNextFlag();
    });
  }

  private updateCache(command: string, result: ParsedHelp): void {
    // Enforce cache size limit (LRU eviction)
    if (this.cache.size >= this.options.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(command, { result, timestamp: Date.now() });
  }

  preloadCommonCommands(commands: string[]): void {
    for (const cmd of commands) {
      this.getHelp(cmd).catch(() => {
        // Fire and forget
      });
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.cache.clear();
  }
}
