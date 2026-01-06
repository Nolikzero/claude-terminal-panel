(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const terminalContainer = document.getElementById('terminal-container');
  if (!terminalContainer) {
    return;
  }

  // Get computed CSS variable value
  function getCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  // Build theme from VS Code CSS variables
  function getVSCodeTheme() {
    return {
      background: getCssVar(
        '--vscode-terminal-background',
        getCssVar('--vscode-editor-background', '#1e1e1e')
      ),
      foreground: getCssVar(
        '--vscode-terminal-foreground',
        getCssVar('--vscode-editor-foreground', '#d4d4d4')
      ),
      cursor: getCssVar('--vscode-terminalCursor-foreground', '#d4d4d4'),
      cursorAccent: getCssVar('--vscode-terminalCursor-background', '#1e1e1e'),
      selectionBackground: getCssVar('--vscode-terminal-selectionBackground', '#264f78'),
      black: getCssVar('--vscode-terminal-ansiBlack', '#000000'),
      red: getCssVar('--vscode-terminal-ansiRed', '#cd3131'),
      green: getCssVar('--vscode-terminal-ansiGreen', '#0dbc79'),
      yellow: getCssVar('--vscode-terminal-ansiYellow', '#e5e510'),
      blue: getCssVar('--vscode-terminal-ansiBlue', '#2472c8'),
      magenta: getCssVar('--vscode-terminal-ansiMagenta', '#bc3fbc'),
      cyan: getCssVar('--vscode-terminal-ansiCyan', '#11a8cd'),
      white: getCssVar('--vscode-terminal-ansiWhite', '#e5e5e5'),
      brightBlack: getCssVar('--vscode-terminal-ansiBrightBlack', '#666666'),
      brightRed: getCssVar('--vscode-terminal-ansiBrightRed', '#f14c4c'),
      brightGreen: getCssVar('--vscode-terminal-ansiBrightGreen', '#23d18b'),
      brightYellow: getCssVar('--vscode-terminal-ansiBrightYellow', '#f5f543'),
      brightBlue: getCssVar('--vscode-terminal-ansiBrightBlue', '#3b8eea'),
      brightMagenta: getCssVar('--vscode-terminal-ansiBrightMagenta', '#d670d6'),
      brightCyan: getCssVar('--vscode-terminal-ansiBrightCyan', '#29b8db'),
      brightWhite: getCssVar('--vscode-terminal-ansiBrightWhite', '#ffffff')
    };
  }

  // Initialize xterm.js terminal with VS Code mono font
  // @ts-ignore
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily:
      'var(--vscode-editor-font-family, "SF Mono", Monaco, Menlo, "Courier New", monospace)',
    lineHeight: 1.2,
    letterSpacing: 0,
    theme: getVSCodeTheme(),
    allowProposedApi: true
  });

  // Load addons
  // @ts-ignore
  const fitAddon = new FitAddon.FitAddon();
  // @ts-ignore
  const webLinksAddon = new WebLinksAddon.WebLinksAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  // Open terminal in container
  terminal.open(terminalContainer);
  fitAddon.fit();

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    vscode.postMessage({
      type: 'resize',
      cols: terminal.cols,
      rows: terminal.rows
    });
  });
  resizeObserver.observe(terminalContainer);

  // Send keystrokes to extension
  terminal.onData((data) => {
    vscode.postMessage({ type: 'input', data: data });
  });

  // Handle messages from extension
  const messageHandler = (event) => {
    const message = event.data;
    switch (message.type) {
      case 'output':
        terminal.write(message.data);
        break;
      case 'clear':
        terminal.clear();
        break;
    }
  };
  window.addEventListener('message', messageHandler);

  // Cleanup on disposal
  window.addEventListener('unload', () => {
    resizeObserver.disconnect();
    window.removeEventListener('message', messageHandler);
    terminal.dispose();
  });

  // Fit terminal and signal ready with dimensions
  fitAddon.fit();
  vscode.postMessage({
    type: 'ready',
    cols: terminal.cols,
    rows: terminal.rows
  });
})();
