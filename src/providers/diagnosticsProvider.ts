import * as vscode from "vscode";
import { ValidationError, DiagnosticInfo, ExtensionConfig } from "../core/types";
import { DIAGNOSTIC_SOURCES } from "../core/constants";
import { ConfigurationManager } from "../core/config";

export class DiagnosticsProvider {
  private diagnosticsCollection: vscode.DiagnosticCollection;
  private configManager: ConfigurationManager;
  private statusBarItem: vscode.StatusBarItem;

  constructor(diagnosticsCollection: vscode.DiagnosticCollection) {
    this.diagnosticsCollection = diagnosticsCollection;
    this.configManager = ConfigurationManager.getInstance();

    // Create status bar item to show validation status
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.show();

    // Listen for config changes
    this.configManager.onConfigChanged((config) => {
      this.refreshAllDiagnostics(config);
    });
  }

  /**
   * Update diagnostics for a specific document
   */
  public updateDiagnostics(uri: vscode.Uri, errors: ValidationError[]): void {
    const config = this.configManager.getConfig();
    const filteredErrors = this.filterErrorsByConfig(errors, config);
    const diagnostics = this.createDiagnostics(filteredErrors, uri);

    this.diagnosticsCollection.set(uri, diagnostics);
    this.updateStatusBar(uri, filteredErrors);
  }

  /**
   * Clear diagnostics for a specific document
   */
  public clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticsCollection.delete(uri);
    this.updateStatusBar(uri, []);
  }

  /**
   * Clear all diagnostics
   */
  public clearAllDiagnostics(): void {
    this.diagnosticsCollection.clear();
    this.statusBarItem.hide();
  }

  /**
   * Get diagnostics for a specific document
   */
  public getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] {
    return this.diagnosticsCollection.get(uri) || [];
  }

  /**
   * Get all diagnostics
   */
  public getAllDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][] {
    const result: [vscode.Uri, vscode.Diagnostic[]][] = [];
    this.diagnosticsCollection.forEach((uri, diagnostics) => {
      result.push([uri, [...diagnostics]]);
    });
    return result;
  }

  /**
   * Create VSCode diagnostics from validation errors
   */
  private createDiagnostics(errors: ValidationError[], uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const error of errors) {
      const diagnostic = this.createDiagnostic(error, uri);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  /**
   * Create a single diagnostic from validation error
   */
  private createDiagnostic(error: ValidationError, uri: vscode.Uri): vscode.Diagnostic | null {
    try {
      // Calculate range
      const line = Math.max(0, error.line - 1);
      const column = Math.max(0, error.column);
      const length = error.length || 1;

      const range = new vscode.Range(new vscode.Position(line, column), new vscode.Position(line, column + length));

      // Convert severity
      const severity = this.convertSeverity(error.severity);

      // Create diagnostic
      const diagnostic = new vscode.Diagnostic(range, error.message, severity);

      // Add metadata
      if (error.code) {
        diagnostic.code = error.code;
      }

      if (error.source) {
        diagnostic.source = error.source;
      }

      // Add tags if available
      if (error.tags && error.tags.length > 0) {
        diagnostic.tags = this.convertTags(error.tags);
      }

      // Add related information for complex errors
      diagnostic.relatedInformation = this.createRelatedInformation(error, uri);

      return diagnostic;
    } catch (err) {
      console.error("Failed to create diagnostic:", err, error);
      return null;
    }
  }

  /**
   * Convert validation severity to VSCode severity
   */
  private convertSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case "error":
        return vscode.DiagnosticSeverity.Error;
      case "warning":
        return vscode.DiagnosticSeverity.Warning;
      case "info":
        return vscode.DiagnosticSeverity.Information;
      case "hint":
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Error;
    }
  }

  /**
   * Convert validation tags to VSCode tags
   */
  private convertTags(tags: any[]): vscode.DiagnosticTag[] {
    const vscTags: vscode.DiagnosticTag[] = [];

    for (const tag of tags) {
      switch (tag) {
        case "deprecated":
          vscTags.push(vscode.DiagnosticTag.Deprecated);
          break;
        case "unnecessary":
          vscTags.push(vscode.DiagnosticTag.Unnecessary);
          break;
      }
    }

    return vscTags;
  }

  /**
   * Create related information for complex errors
   */
  private createRelatedInformation(error: ValidationError, uri: vscode.Uri): vscode.DiagnosticRelatedInformation[] {
    const related: vscode.DiagnosticRelatedInformation[] = [];

    // Add helpful links for common errors
    if (error.code === "M003") {
      // Mismatched sections
      // This would typically reference the opening section
      // For now, we'll add a general help message
    }

    return related;
  }

  /**
   * Filter errors based on configuration
   */
  private filterErrorsByConfig(errors: ValidationError[], config: ExtensionConfig): ValidationError[] {
    return errors.filter((error) => {
      switch (error.severity) {
        case "warning":
          return config.showWarnings;
        case "hint":
          return config.showHints;
        case "info":
          return true; // Always show info
        case "error":
          return true; // Always show errors
        default:
          return true;
      }
    });
  }

  /**
   * Update status bar with validation results
   */
  private updateStatusBar(uri: vscode.Uri, errors: ValidationError[]): void {
    const activeEditor = vscode.window.activeTextEditor;

    // Only update if this is the active document
    if (!activeEditor || activeEditor.document.uri.toString() !== uri.toString()) {
      return;
    }

    const errorCount = errors.filter((e) => e.severity === "error").length;
    const warningCount = errors.filter((e) => e.severity === "warning").length;

    if (errorCount === 0 && warningCount === 0) {
      this.statusBarItem.text = "$(check) Mustache: Valid";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
    } else {
      let text = "$(alert) Mustache:";
      if (errorCount > 0) {
        text += ` ${errorCount} error${errorCount > 1 ? "s" : ""}`;
      }
      if (warningCount > 0) {
        if (errorCount > 0) {
          text += ",";
        }
        text += ` ${warningCount} warning${warningCount > 1 ? "s" : ""}`;
      }

      this.statusBarItem.text = text;
      this.statusBarItem.backgroundColor =
        errorCount > 0 ? new vscode.ThemeColor("statusBarItem.errorBackground") : new vscode.ThemeColor("statusBarItem.warningBackground");
    }

    this.statusBarItem.tooltip = this.createStatusTooltip(errors);
    this.statusBarItem.command = "workbench.action.showErrorsWarnings";
  }

  /**
   * Create tooltip for status bar
   */
  private createStatusTooltip(errors: ValidationError[]): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();

    if (errors.length === 0) {
      tooltip.appendMarkdown("**Mustache JSON Validator**: No issues found");
      return tooltip;
    }

    tooltip.appendMarkdown("**Mustache JSON Validator Issues:**\n\n");

    // Group by severity
    const errorsByType = {
      error: errors.filter((e) => e.severity === "error"),
      warning: errors.filter((e) => e.severity === "warning"),
      info: errors.filter((e) => e.severity === "info"),
      hint: errors.filter((e) => e.severity === "hint"),
    };

    for (const [type, typeErrors] of Object.entries(errorsByType)) {
      if (typeErrors.length > 0) {
        const icon = this.getSeverityIcon(type);
        tooltip.appendMarkdown(`${icon} **${type.charAt(0).toUpperCase() + type.slice(1)}s (${typeErrors.length})**\n\n`);

        // Show first few errors
        const maxShow = 3;
        for (let i = 0; i < Math.min(maxShow, typeErrors.length); i++) {
          const error = typeErrors[i];
          tooltip.appendMarkdown(`• Line ${error.line}: ${error.message}\n`);
        }

        if (typeErrors.length > maxShow) {
          tooltip.appendMarkdown(`• ...and ${typeErrors.length - maxShow} more\n`);
        }

        tooltip.appendMarkdown("\n");
      }
    }

    tooltip.appendMarkdown("Click to view details in Problems panel.");

    return tooltip;
  }

  /**
   * Get icon for severity type
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case "error":
        return "$(error)";
      case "warning":
        return "$(warning)";
      case "info":
        return "$(info)";
      case "hint":
        return "$(light-bulb)";
      default:
        return "$(question)";
    }
  }

  /**
   * Refresh all diagnostics when configuration changes
   */
  private refreshAllDiagnostics(config: ExtensionConfig): void {
    // Re-apply filtering to existing diagnostics
    this.diagnosticsCollection.forEach((uri, diagnostics) => {
      // This is a simplified refresh - in a real implementation,
      // you'd want to re-run validation with the new config
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.uri.toString() === uri.toString()) {
        // Trigger re-validation for the active document
        vscode.commands.executeCommand("mustacheJsonValidator.validate");
      }
    });
  }

  /**
   * Create diagnostic info object
   */
  public createDiagnosticInfo(
    range: vscode.Range,
    message: string,
    severity: vscode.DiagnosticSeverity,
    code?: string,
    source?: string
  ): DiagnosticInfo {
    return {
      range,
      message,
      severity,
      code,
      source: source || DIAGNOSTIC_SOURCES.MUSTACHE,
    };
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.diagnosticsCollection.dispose();
    this.statusBarItem.dispose();
  }
}
