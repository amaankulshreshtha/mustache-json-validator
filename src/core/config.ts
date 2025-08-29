import * as vscode from "vscode";
import { ExtensionConfig, ContextFileInfo } from "./types";
import { CONFIG_SECTION, CONFIG_KEYS, DEFAULT_CONFIG } from "./constants";

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private _onConfigChanged = new vscode.EventEmitter<ExtensionConfig>();

  public readonly onConfigChanged = this._onConfigChanged.event;

  private constructor() {
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        this._onConfigChanged.fire(this.getConfig());
      }
    });
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get the current extension configuration
   */
  public getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    return {
      enableRealTimeValidation: config.get(CONFIG_KEYS.ENABLE_REAL_TIME_VALIDATION, DEFAULT_CONFIG.enableRealTimeValidation),
      contextFile: config.get(CONFIG_KEYS.CONTEXT_FILE, DEFAULT_CONFIG.contextFile),
      validateJsonOutput: config.get(CONFIG_KEYS.VALIDATE_JSON_OUTPUT, DEFAULT_CONFIG.validateJsonOutput),
      showWarnings: config.get(CONFIG_KEYS.SHOW_WARNINGS, DEFAULT_CONFIG.showWarnings),
      showHints: config.get(CONFIG_KEYS.SHOW_HINTS, DEFAULT_CONFIG.showHints),
      autoFormat: config.get(CONFIG_KEYS.AUTO_FORMAT, DEFAULT_CONFIG.autoFormat),
      maxCacheSize: config.get(CONFIG_KEYS.MAX_CACHE_SIZE, DEFAULT_CONFIG.maxCacheSize),
      debounceTime: config.get(CONFIG_KEYS.DEBOUNCE_TIME, DEFAULT_CONFIG.debounceTime),
    };
  }

  /**
   * Update a configuration value
   */
  public async updateConfig<K extends keyof ExtensionConfig>(
    key: K,
    value: ExtensionConfig[K],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, value, target);
  }

  /**
   * Get workspace-specific configuration
   */
  public getWorkspaceConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return this.getConfig();
  }

  /**
   * Get global (user) configuration
   */
  public getGlobalConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const inspect = config.inspect(CONFIG_KEYS.ENABLE_REAL_TIME_VALIDATION);

    // This is a simplified version - you'd need to inspect each key individually
    return this.getConfig();
  }

  /**
   * Reset configuration to defaults
   */
  public async resetToDefaults(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
      await config.update(key, defaultValue, vscode.ConfigurationTarget.Workspace);
    }
  }

  /**
   * Validate configuration values
   */
  public validateConfig(config: ExtensionConfig): string[] {
    const errors: string[] = [];

    if (config.debounceTime < 0 || config.debounceTime > 5000) {
      errors.push("Debounce time must be between 0 and 5000ms");
    }

    if (config.maxCacheSize < 1 || config.maxCacheSize > 1000) {
      errors.push("Max cache size must be between 1 and 1000");
    }

    if (config.contextFile && !this.isValidContextFilePath(config.contextFile)) {
      errors.push("Context file path is not valid");
    }

    return errors;
  }

  /**
   * Get context file information
   */
  public async getContextFileInfo(): Promise<ContextFileInfo | null> {
    const config = this.getConfig();

    if (!config.contextFile) {
      return null;
    }

    const contextPath = this.resolveContextFilePath(config.contextFile);

    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(contextPath));

      // Try to read and parse the context file
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(contextPath));
      const textContent = Buffer.from(content).toString("utf8");

      let parsedContent;
      let isValid = true;
      let error;

      try {
        parsedContent = JSON.parse(textContent);
      } catch (parseError) {
        isValid = false;
        error = parseError instanceof Error ? parseError.message : "Invalid JSON";
      }

      return {
        path: contextPath,
        exists: true,
        isValid,
        lastModified: stat.mtime,
        content: parsedContent,
        error,
      };
    } catch (err) {
      return {
        path: contextPath,
        exists: false,
        isValid: false,
        lastModified: 0,
        error: err instanceof Error ? err.message : "File not found",
      };
    }
  }

  /**
   * Set context file path
   */
  public async setContextFile(filePath: string): Promise<void> {
    await this.updateConfig("contextFile", filePath);
  }

  /**
   * Clear context file
   */
  public async clearContextFile(): Promise<void> {
    await this.updateConfig("contextFile", "");
  }

  /**
   * Toggle real-time validation
   */
  public async toggleRealTimeValidation(): Promise<boolean> {
    const config = this.getConfig();
    const newValue = !config.enableRealTimeValidation;
    await this.updateConfig("enableRealTimeValidation", newValue);
    return newValue;
  }

  /**
   * Get configuration for a specific workspace folder
   */
  public getConfigForWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION, workspaceFolder.uri);
    return this.getConfig();
  }

  /**
   * Export current configuration as JSON
   */
  public exportConfig(): string {
    const config = this.getConfig();
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  public async importConfig(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson) as Partial<ExtensionConfig>;

      // Validate imported config
      const mergedConfig = { ...this.getConfig(), ...importedConfig };
      const validationErrors = this.validateConfig(mergedConfig);

      if (validationErrors.length > 0) {
        throw new Error(`Invalid configuration: ${validationErrors.join(", ")}`);
      }

      // Update each configuration key
      for (const [key, value] of Object.entries(importedConfig)) {
        if (value !== undefined) {
          await this.updateConfig(key as keyof ExtensionConfig, value);
        }
      }
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private isValidContextFilePath(filePath: string): boolean {
    // Basic validation - you could make this more sophisticated
    return (
      filePath.length > 0 &&
      (filePath.endsWith(".json") || filePath.includes(".json")) &&
      !filePath.includes("..") &&
      filePath.trim() === filePath
    );
  }

  private resolveContextFilePath(filePath: string): string {
    // If it's already absolute, return as-is
    if (vscode.Uri.parse(filePath).scheme) {
      return filePath;
    }

    // Resolve relative to workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return vscode.Uri.joinPath(workspaceFolder.uri, filePath).fsPath;
    }

    return filePath;
  }

  public dispose(): void {
    this._onConfigChanged.dispose();
  }
}
