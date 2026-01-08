import type { Terminal as XTermTerminal, ITheme } from '@xterm/xterm';
import type { FitAddon as XTermFitAddon } from '@xterm/addon-fit';
import type { WebLinksAddon as XTermWebLinksAddon } from '@xterm/addon-web-links';

// VS Code API types for webview
export interface VSCodeAPI {
  postMessage(message: WebviewOutgoingMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

// Global declarations for xterm.js CDN globals
declare global {
  function acquireVsCodeApi(): VSCodeAPI;

  // xterm.js globals (loaded via CDN)
  const Terminal: typeof XTermTerminal;
  const FitAddon: { FitAddon: typeof XTermFitAddon };
  const WebLinksAddon: { WebLinksAddon: typeof XTermWebLinksAddon };
}

// Tab information
export interface TabInfo {
  id: string;
  name: string;
  isActive: boolean;
}

// Message types from extension to webview
export type WebviewIncomingMessage =
  | { type: 'output'; id: string; data: string }
  | { type: 'clear'; id: string }
  | { type: 'tabsUpdate'; tabs: TabInfo[] }
  | { type: 'createTab'; id: string; name: string }
  | { type: 'switchTab'; id: string }
  | { type: 'removeTab'; id: string };

// Message types from webview to extension
export type WebviewOutgoingMessage =
  | { type: 'ready'; cols: number; rows: number }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'newTab' }
  | { type: 'closeTab'; id: string }
  | { type: 'switchTab'; id: string };

// Terminal entry in the map
export interface TerminalEntry {
  terminal: XTermTerminal;
  fitAddon: XTermFitAddon;
  element: HTMLDivElement;
  isAtBottom: boolean;
  lastScrollTop: number;
}

// xterm.js theme type (re-export for convenience)
export type XTermTheme = ITheme;
