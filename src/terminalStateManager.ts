import type { TerminalInstance, TabInfo } from './types';
import { WORKSPACE_ACCENT_COLORS } from './types';

/**
 * Manages terminal instance state including active terminal tracking.
 * Eliminates duplicated tab activation logic.
 */
export class TerminalStateManager {
  private readonly terminals = new Map<string, TerminalInstance>();
  private activeTerminalId: string | undefined;
  private terminalCounter = 0;

  /**
   * Generates a unique terminal ID.
   */
  generateId(): string {
    return `terminal-${String(Date.now())}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generates the next terminal name.
   */
  generateName(): string {
    this.terminalCounter++;
    return `Claude ${String(this.terminalCounter)}`;
  }

  /**
   * Gets a terminal instance by ID.
   */
  get(id: string): TerminalInstance | undefined {
    return this.terminals.get(id);
  }

  /**
   * Sets a terminal instance.
   */
  set(id: string, instance: TerminalInstance): void {
    this.terminals.set(id, instance);
  }

  /**
   * Deletes a terminal instance.
   */
  delete(id: string): boolean {
    return this.terminals.delete(id);
  }

  /**
   * Gets all terminal instances.
   */
  getAll(): TerminalInstance[] {
    return Array.from(this.terminals.values());
  }

  /**
   * Gets all terminal IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Gets the count of terminals.
   */
  get count(): number {
    return this.terminals.size;
  }

  /**
   * Gets the active terminal ID.
   */
  getActiveId(): string | undefined {
    return this.activeTerminalId;
  }

  /**
   * Deactivates the current terminal and activates a new one.
   * This eliminates the duplicated tab activation logic.
   * Returns the previously active terminal (if any).
   */
  setActive(id: string): TerminalInstance | undefined {
    let previousActive: TerminalInstance | undefined;

    // Deactivate previous
    if (this.activeTerminalId && this.activeTerminalId !== id) {
      previousActive = this.terminals.get(this.activeTerminalId);
      if (previousActive) {
        previousActive.isActive = false;
      }
    }

    // Activate new
    const instance = this.terminals.get(id);
    if (instance) {
      instance.isActive = true;
      this.activeTerminalId = id;
    }

    return previousActive;
  }

  /**
   * Clears the active terminal (sets to undefined).
   */
  clearActive(): void {
    this.activeTerminalId = undefined;
  }

  /**
   * Gets tab information for all terminals.
   */
  getTabsInfo(): TabInfo[] {
    return this.getAll().map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      accentColor: this.getAccentColor(t.workspaceFolderIndex)
    }));
  }

  /**
   * Returns the accent color for a workspace folder index.
   * Returns undefined for single-folder workspaces (no color accent).
   */
  private getAccentColor(folderIndex: number | undefined): string | undefined {
    if (folderIndex === undefined) {
      return undefined;
    }
    return WORKSPACE_ACCENT_COLORS[folderIndex % WORKSPACE_ACCENT_COLORS.length];
  }

  /**
   * Iterates over all terminal IDs.
   */
  forEachId(callback: (id: string) => void): void {
    for (const id of this.terminals.keys()) {
      callback(id);
    }
  }
}
