# Changelog

All notable changes to the "Claude Terminal Panel" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-06

### Added

- Initial release
- Dedicated terminal panel in VS Code activity bar
- Support for Claude Code, Gemini CLI, Aider, OpenAI Codex, and any CLI tool
- Full xterm.js terminal emulation with 256-color support
- VS Code theme integration (automatically syncs with your theme)
- Dual execution modes:
  - Direct mode: Runs command directly for cleaner output
  - Shell mode: Spawns shell with full shell features (pipes, redirects, etc.)
- Auto-run on startup (configurable)
- Quick actions: Restart and Clear terminal
- Configurable settings:
  - Custom command and arguments
  - Custom shell path
  - Additional environment variables
  - Direct mode toggle
