# Claude Terminal Panel

[![Install in VS Code](https://img.shields.io/badge/Install%20in%20VS%20Code-Open-blue?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=0ly.claude-terminal-panel)
[![Download VSIX](https://img.shields.io/github/v/release/nolikzero/claude-terminal-panel?style=for-the-badge&label=VSIX&color=green)](https://github.com/nolikzero/claude-terminal-panel/releases/latest)

[![VS Code](https://img.shields.io/badge/VS%20Code-1.106%2B-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/nolikzero/claude-terminal-panel?label=version&color=green)](https://github.com/nolikzero/claude-terminal-panel/releases/latest)

> A dedicated terminal in the secondary sidebar for running AI coding assistants

Run **Claude Code**, **Gemini CLI**, **OpenAI Codex**, **Aider**, **OpenCode** and any other AI CLI tool directly from your VS Code sidebar.

![Claude Terminal Panel Screenshot](media/screenshot.png)

## Features

- **Dedicated Sidebar Terminal** - Run any AI CLI tool directly from VS Code's secondary sidebar, always accessible while you code
- **Multi-Tab Support** - Run multiple terminal instances simultaneously with keyboard shortcuts for quick navigation
- **Prompt Notifications** - Visual indicator (pulsing red dot) when the terminal is waiting for your input
- **Custom Commands** - Create new terminals with custom commands, intelligent flag suggestions from `--help`
- **Working Directory Selection** - Choose which workspace folder to use when creating new terminals
- **Tab Accent Colors** - Color-coded tabs per workspace folder for easy identification in multi-root workspaces
- **Works with Any AI Tool** - Claude Code, Gemini CLI, OpenAI Codex, Aider, and more
- **VS Code Theme Integration** - Full 256-color support with automatic theme synchronization
- **Dual Execution Modes** - Choose between direct mode (cleaner output) or shell mode (full shell features)
- **Auto-run on Startup** - Optionally start your AI assistant automatically when VS Code opens
- **Fully Configurable** - Customize the command, arguments, shell, and environment variables
- **Quick Actions** - Restart the terminal with a single click

## Requirements

- **VS Code** 1.106.0 or higher
- **An AI CLI tool** installed and accessible in your PATH (see [Supported Tools](#supported-tools))
- **Node.js** - Required for native module compilation

## Supported Tools

This extension works with any command-line AI assistant. Here are some popular options, with corrected installation instructions and additional top CLI AI coding agents based on current popularity in 2025-2026, including OpenCode:

| Tool                                                                    | Command       | Installation                               |
| ----------------------------------------------------------------------- | ------------- | ------------------------------------------ |
| [Claude Code](https://github.com/anthropics/claude-code)                | `claude`      | `npm install -g @anthropic-ai/claude-code` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)               | `gemini`      | `npm install -g @google/gemini-cli`        |
| [Aider](https://aider.chat)                                             | `aider`       | `pip install aider-chat`                   |
| [Codex CLI](https://github.com/openai/codex)                            | `codex`       | `npm install -g @openai/codex`             |
| [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli)       | `gh copilot`  | `gh extension install github/gh-copilot`   |
| [Open Interpreter](https://github.com/openinterpreter/open-interpreter) | `interpreter` | `pip install open-interpreter`             |
| [OpenCode](https://github.com/opencode-ai/opencode)                     | `opencode`    | `brew install opencode-ai/tap/opencode`    |
| Any CLI tool                                                            | Custom        | Configure via settings                     |

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "Claude Terminal Panel"
4. Click Install

### From VSIX File

1. Download the `.vsix` file from the [Releases](../../releases) page
2. Open VS Code
3. Run `Extensions: Install from VSIX...` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Select the downloaded `.vsix` file

### Build from Source

```bash
# Clone the repository
git clone https://github.com/nolikzero/claude-terminal-panel.git
cd claude-terminal-panel

# Install dependencies
npm install

# Build the extension
npm run compile

# Package the extension
npm run package
```

## Usage

1. **Open the Sidebar** - Click the Claude icon in the activity bar (secondary sidebar)
2. **Interact with your AI** - Type your prompts and interact with your AI assistant directly in the terminal
3. **Use Quick Actions** - Click the restart icon in the view title bar, or use the + button to add new tabs

### Commands

| Command                         | Description                    |
| ------------------------------- | ------------------------------ |
| `Claude Terminal: Restart`      | Restart the terminal session   |
| `Claude Terminal: New Tab`      | Create a new terminal tab      |
| `Claude Terminal: Close Tab`    | Close the current terminal tab |
| `Claude Terminal: Next Tab`     | Switch to the next tab         |
| `Claude Terminal: Previous Tab` | Switch to the previous tab     |

Access commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) or the view title bar icons.

### Keyboard Shortcuts

| Action       | Windows/Linux   | macOS           |
| ------------ | --------------- | --------------- |
| New Tab      | `Ctrl+Shift+``  | `Cmd+Shift+``   |
| Close Tab    | `Ctrl+W`        | `Cmd+W`         |
| Next Tab     | `Ctrl+PageDown` | `Cmd+Alt+Right` |
| Previous Tab | `Ctrl+PageUp`   | `Cmd+Alt+Left`  |

## Configuration

Configure the extension via VS Code Settings (`Cmd+,` / `Ctrl+,`):

| Setting                                  | Type    | Default    | Description                                               |
| ---------------------------------------- | ------- | ---------- | --------------------------------------------------------- |
| `claudeTerminal.command`                 | string  | `"claude"` | The command to run in the terminal                        |
| `claudeTerminal.args`                    | array   | `[]`       | Arguments to pass to the command                          |
| `claudeTerminal.autoRun`                 | boolean | `true`     | Automatically run the command when the terminal opens     |
| `claudeTerminal.shell`                   | string  | `""`       | Custom shell to use (empty for system default)            |
| `claudeTerminal.env`                     | object  | `{}`       | Additional environment variables                          |
| `claudeTerminal.directMode`              | boolean | `true`     | Run command directly without shell wrapper                |
| `claudeTerminal.promptNotification`      | boolean | `true`     | Show notification indicator when terminal awaits input    |
| `claudeTerminal.promptNotificationDelay` | number  | `300`      | Delay (ms) before showing notification after output stops |
| `claudeTerminal.promptPatterns`          | array   | `[]`       | Additional regex patterns to detect input prompts         |

### Configuration Examples

**Claude Code (default):**

```json
{
  "claudeTerminal.command": "claude",
  "claudeTerminal.args": []
}
```

**Gemini CLI:**

```json
{
  "claudeTerminal.command": "gemini",
  "claudeTerminal.args": []
}
```

**Aider:**

```json
{
  "claudeTerminal.command": "aider",
  "claudeTerminal.args": ["--model", "gpt-4"]
}
```

**OpenAI Codex:**

```json
{
  "claudeTerminal.command": "codex",
  "claudeTerminal.args": []
}
```

**GitHub Copilot CLI:**

```json
{
  "claudeTerminal.command": "gh",
  "claudeTerminal.args": ["copilot"]
}
```

**Running with shell features:**

```json
{
  "claudeTerminal.directMode": false,
  "claudeTerminal.shell": "/bin/zsh"
}
```

**Adding environment variables:**

```json
{
  "claudeTerminal.env": {
    "ANTHROPIC_API_KEY": "your-api-key",
    "OPENAI_API_KEY": "your-openai-key"
  }
}
```

## Prompt Notifications

The extension can detect when the terminal is waiting for user input and show a visual notification (pulsing red dot) on the tab. This helps you notice when your AI assistant needs attention, even when you're working in another part of VS Code.

### Built-in Detection Patterns

The extension automatically detects common prompt patterns:

- **Yes/No prompts**: `[Y/n]`, `(y/n)`, `[yes/no]`
- **Confirmation prompts**: `Confirm?`, `Continue?`, `Accept?`, `Proceed?`, `Apply?`
- **Interactive menus**: `❯`, `›`, numbered selections
- **REPL prompts**: `>`, `>>>`, `command>`
- **Claude Code hints**: Plan file prompts, "Would you like to" questions
- **General prompts**: "Press enter to confirm", "Esc to cancel"

### Custom Prompt Patterns

If your AI tool uses custom prompts not detected by default, you can add your own regex patterns:

```json
{
  "claudeTerminal.promptPatterns": ["^mybot> $", "\\[waiting\\]", "^Input: $"]
}
```

### Disabling Notifications

To disable prompt notifications entirely:

```json
{
  "claudeTerminal.promptNotification": false
}
```

## Custom Commands

Click the CLI icon button (next to the + button) in the tab bar to create a terminal with a custom command instead of the default.

### Command Input

When creating a custom terminal, you'll be prompted to enter:

1. **Command**: The CLI tool to run (e.g., `aider`, `gemini`, `opencode`)
2. **Arguments**: Additional flags and options

### Intelligent Flag Suggestions

As you type, the extension fetches available flags from the command's `--help` output and suggests them. This works with most CLI tools including:

- Claude Code
- Gemini CLI
- Aider
- OpenCode
- And any tool that supports `--help`

### Working Directory Selection

In multi-root workspaces, you'll be prompted to select which folder the terminal should start in. Each folder gets a unique accent color on its tab for easy identification.

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

### Running in Debug Mode

1. Open this project in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension will be active in the new VS Code window

### Available Scripts

| Script             | Description                |
| ------------------ | -------------------------- |
| `npm run compile`  | Compile the extension      |
| `npm run watch`    | Watch mode for development |
| `npm run lint`     | Run ESLint                 |
| `npm run lint:fix` | Fix ESLint issues          |
| `npm run format`   | Format code with Prettier  |
| `npm run package`  | Create VSIX package        |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For bugs and feature requests, please [open an issue](../../issues).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [xterm.js](https://xtermjs.org/) - The terminal emulator powering the UI
- [node-pty](https://github.com/microsoft/node-pty) - Native pseudoterminal support

---

<p align="center">
  Made with care for the AI-assisted development community
</p>
