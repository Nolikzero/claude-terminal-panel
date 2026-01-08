import * as vscode from 'vscode';
import { HelpExecutor } from './helpExecutor';
import { CommandFlag } from './types';

interface CommandQuickPickItem extends vscode.QuickPickItem {
  flag?: CommandFlag;
  isRunCommand?: boolean;
}

export interface CommandInputResult {
  command: string;
  args: string[];
  cancelled: boolean;
}

export class CommandInputPicker {
  private helpExecutor: HelpExecutor;

  constructor() {
    this.helpExecutor = new HelpExecutor({
      debounceMs: 300,
      timeout: 5000,
      cacheMaxAge: 5 * 60 * 1000
    });
  }

  async promptForCommand(defaultValue: string): Promise<CommandInputResult> {
    return new Promise((resolve) => {
      const quickPick = vscode.window.createQuickPick<CommandQuickPickItem>();
      quickPick.title = 'Enter Command with Arguments';
      quickPick.placeholder = 'Type command name, then select flags...';
      quickPick.value = defaultValue;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      let currentCommand = '';
      let availableFlags: CommandFlag[] = [];

      const parseInput = (
        value: string
      ): { command: string; existingArgs: string[]; partial: string } => {
        const parts = value.trim().split(/\s+/);
        const command = parts[0] || '';
        const allArgs = parts.slice(1);
        // Check if user is typing a partial flag
        const lastPart = allArgs[allArgs.length - 1] || '';
        const isPartial = lastPart.startsWith('-') && !lastPart.includes('=');
        return {
          command,
          existingArgs: isPartial ? allArgs.slice(0, -1) : allArgs,
          partial: isPartial ? lastPart : ''
        };
      };

      const buildItems = (
        flags: CommandFlag[],
        partial: string,
        existingArgs: string[]
      ): CommandQuickPickItem[] => {
        const items: CommandQuickPickItem[] = [];
        const currentValue = quickPick.value.trim();

        // Always show "run current command" option at top
        if (currentValue) {
          items.push({
            label: `$(play) Run: ${currentValue}`,
            description: 'Press Enter to execute this command',
            isRunCommand: true,
            alwaysShow: true
          });
        }

        // Filter flags that haven't been used and match partial input
        const usedFlags = new Set(existingArgs.filter((a) => a.startsWith('-')));
        const filteredFlags = flags.filter((f) => {
          // Skip already used flags
          if (usedFlags.has(f.flag)) return false;
          if (f.shortFlag && usedFlags.has(f.shortFlag)) return false;

          // Filter by partial input
          if (partial) {
            const lowerPartial = partial.toLowerCase();
            return (
              f.flag.toLowerCase().includes(lowerPartial) ||
              (f.shortFlag?.toLowerCase().includes(lowerPartial) ?? false)
            );
          }
          return true;
        });

        // Add flag suggestions (alwaysShow bypasses QuickPick's built-in filter)
        for (const flag of filteredFlags) {
          const label = flag.shortFlag ? `${flag.shortFlag}, ${flag.flag}` : flag.flag;
          items.push({
            label: label + (flag.valueHint ? ` ${flag.valueHint}` : ''),
            description: flag.description,
            detail: flag.takesValue ? '(requires value)' : undefined,
            flag,
            alwaysShow: true
          });
        }

        // Show message if no flags available
        if (flags.length === 0 && currentValue) {
          items.push({
            label: '$(info) No flag suggestions available',
            description: 'Type your command and press Enter to run',
            alwaysShow: true
          });
        }

        return items;
      };

      // Handle input changes with debounced help fetching
      quickPick.onDidChangeValue((value) => {
        const { command, existingArgs, partial } = parseInput(value);

        // If command changed, fetch new help
        if (command && command !== currentCommand) {
          currentCommand = command;
          quickPick.busy = true;

          this.helpExecutor.getDebouncedHelp(command, (result) => {
            availableFlags = result.flags;
            const { existingArgs: args, partial: p } = parseInput(quickPick.value);
            quickPick.items = buildItems(availableFlags, p, args);
            quickPick.busy = false;
          });
        } else if (command === currentCommand) {
          // Same command, just update filtering
          quickPick.items = buildItems(availableFlags, partial, existingArgs);
        }
      });

      // Handle item selection
      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];

        if (quickPick.selectedItems.length === 0 || selected.isRunCommand) {
          // User pressed enter - execute command
          const parts = quickPick.value.trim().split(/\s+/);
          resolve({
            command: parts[0] || '',
            args: parts.slice(1),
            cancelled: false
          });
          quickPick.dispose();
          return;
        }

        if (selected.flag) {
          // Append flag to current value
          const flag = selected.flag;
          let newValue = quickPick.value.trim();

          // Remove any partial flag being typed
          const parts = newValue.split(/\s+/);
          if (parts.length > 1) {
            const lastPart = parts[parts.length - 1];
            if (lastPart.startsWith('-') && !lastPart.includes('=')) {
              parts.pop();
              newValue = parts.join(' ');
            }
          }

          // Add the selected flag
          newValue = newValue + (newValue ? ' ' : '') + flag.flag;

          // If flag takes a value, add = for value input
          if (flag.takesValue) {
            newValue += '=';
          } else {
            newValue += ' ';
          }

          quickPick.value = newValue;
          // Keep picker open for more flag selection
        }
      });

      // Handle dismissal
      quickPick.onDidHide(() => {
        resolve({
          command: '',
          args: [],
          cancelled: true
        });
        quickPick.dispose();
      });

      // Initial load if default value has a command
      if (defaultValue) {
        const { command, existingArgs, partial } = parseInput(defaultValue);
        if (command) {
          currentCommand = command;
          quickPick.busy = true;
          void this.helpExecutor.getHelp(command).then((result) => {
            availableFlags = result.flags;
            quickPick.items = buildItems(availableFlags, partial, existingArgs);
            quickPick.busy = false;
          });
        }
      }

      quickPick.show();
    });
  }

  preloadCommands(commands: string[]): void {
    this.helpExecutor.preloadCommonCommands(commands);
  }

  dispose(): void {
    this.helpExecutor.dispose();
  }
}
