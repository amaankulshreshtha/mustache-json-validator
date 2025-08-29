import * as vscode from "vscode";
import { MustacheValidator } from "../validators/mustache/mustacheValidator";
import { JSONValidator } from "../validators/json/jsonValidator";
import { TemplateEngine } from "../services/templateEngine";
import { DiagnosticsProvider } from "../providers/diagnosticsProvider";
import { ConfigurationManager } from "../core/config";
import { CommandContext } from "../core/types";

export class ValidateCommand {
  private mustacheValidator: MustacheValidator;
  private jsonValidator: JSONValidator;
  private templateEngine: TemplateEngine;
  private diagnosticsProvider: DiagnosticsProvider;
  private configManager: ConfigurationManager;

  constructor(
    mustacheValidator: MustacheValidator,
    jsonValidator: JSONValidator,
    templateEngine: TemplateEngine,
    diagnosticsProvider: DiagnosticsProvider,
    configManager: ConfigurationManager
  ) {
    this.mustacheValidator = mustacheValidator;
    this.jsonValidator = jsonValidator;
    this.templateEngine = templateEngine;
    this.diagnosticsProvider = diagnosticsProvider;
    this.configManager = configManager;
  }

  /**
   * Execute validation command
   */
  public async execute(context?: CommandContext): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    const document = activeEditor.document;

    if (!this.isValidDocument(document)) {
      vscode.window.showWarningMessage("Current file is not a Mustache template (.mustache, .mustache.json, .mst.json)");
      return;
    }

    await this.validateDocument(document);
  }

  /**
   * Validate a specific document
   */
  private async validateDocument(document: vscode.TextDocument): Promise<void> {
    const startTime = Date.now();

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Validating Mustache template...",
          cancellable: false,
        },
        async (progress) => {
          const text = document.getText();
          const errors: any[] = [];

          // Step 1: Validate Mustache syntax
          progress.report({ increment: 20, message: "Checking Mustache syntax..." });
          const mustacheResult = await this.mustacheValidator.validateWithTiming(text, document);
          errors.push(...mustacheResult.errors);

          // Step 2: Generate JSON if Mustache is valid
          let jsonOutput = "";
          if (mustacheResult.isValid) {
            progress.report({ increment: 30, message: "Rendering template..." });
            const renderResult = await this.templateEngine.renderTemplate(text);

            if (renderResult.success && renderResult.output) {
              jsonOutput = renderResult.output;

              // Step 3: Validate generated JSON
              const config = this.configManager.getConfig();
              if (config.validateJsonOutput) {
                progress.report({ increment: 30, message: "Validating JSON output..." });
                const jsonResult = await this.jsonValidator.validateWithTiming(jsonOutput, document);
                errors.push(...jsonResult.errors);
              }
            } else if (renderResult.error) {
              errors.push({
                message: `Template rendering failed: ${renderResult.error}`,
                line: 1,
                column: 0,
                severity: "error",
                source: "template-engine",
              });
            }
          }

          progress.report({ increment: 20, message: "Updating diagnostics..." });

          // Update diagnostics
          this.diagnosticsProvider.updateDiagnostics(document.uri, errors);
        }
      );

      // Show results
      await this.showValidationResults(document, startTime);
    } catch (error) {
      vscode.window.showErrorMessage(`Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Show validation results to user
   */
  private async showValidationResults(document: vscode.TextDocument, startTime: number): Promise<void> {
    const diagnostics = this.diagnosticsProvider.getDiagnostics(document.uri);
    const duration = Date.now() - startTime;

    const errorCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
    const warningCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length;

    if (errorCount === 0 && warningCount === 0) {
      vscode.window.showInformationMessage(`✅ Validation completed successfully in ${duration}ms - No issues found!`);
    } else {
      let message = `⚠️ Validation completed in ${duration}ms - `;
      if (errorCount > 0) {
        message += `${errorCount} error${errorCount > 1 ? "s" : ""}`;
      }
      if (warningCount > 0) {
        if (errorCount > 0) {
          message += ", ";
        }
        message += `${warningCount} warning${warningCount > 1 ? "s" : ""}`;
      }
      message += " found";

      const choice = await vscode.window.showWarningMessage(message, "View Problems", "Ignore");

      if (choice === "View Problems") {
        vscode.commands.executeCommand("workbench.action.showErrorsWarnings");
      }
    }
  }

  /**
   * Check if document is valid for validation
   */
  private isValidDocument(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    const validExtensions = [".mustache", ".mustache.json", ".mst.json"];

    return (
      validExtensions.some((ext) => fileName.endsWith(ext)) || document.languageId === "mustache-json" || document.languageId === "mustache"
    );
  }
}
