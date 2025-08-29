import * as vscode from "vscode";
import { MustacheValidator } from "./validators/mustache/mustacheValidator";
import { JSONValidator } from "./validators/json/jsonValidator";
import { DiagnosticsProvider } from "./providers/diagnosticsProvider";
import {
  MustacheJSONDocumentFormattingProvider,
  MustacheJSONDocumentRangeFormattingProvider,
  MustacheJSONOnTypeFormattingProvider,
} from "./providers/documentFormattingProvider";

// Global extension state
let diagnosticsCollection: vscode.DiagnosticCollection;
let diagnosticsProvider: DiagnosticsProvider;
let mustacheValidator: MustacheValidator;
let jsonValidator: JSONValidator;

// Debounce timers for validation
const validationTimers = new Map<string, NodeJS.Timeout>();

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("🚀 Mustache JSON Validator extension is now active!");

  try {
    // Initialize core services
    initializeServices(context);

    // Register document selectors
    const documentSelector = getDocumentSelector();

    // Register formatting providers
    registerFormattingProviders(context, documentSelector);

    // Register commands
    registerCommands(context);

    // Register event listeners
    registerEventListeners(context);

    // Validate open documents
    validateOpenDocuments();

    console.log("✅ Mustache JSON Validator activated successfully!");
  } catch (error) {
    console.error("❌ Failed to activate Mustache JSON Validator:", error);
    vscode.window.showErrorMessage(`Failed to activate extension: ${error}`);
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log("🛑 Mustache JSON Validator is deactivating...");

  // Clear all validation timers
  for (const timer of validationTimers.values()) {
    clearTimeout(timer);
  }
  validationTimers.clear();

  // Dispose services
  diagnosticsProvider?.dispose();
  diagnosticsCollection?.dispose();

  console.log("✅ Mustache JSON Validator deactivated successfully");
}

/**
 * Initialize core services
 */
function initializeServices(context: vscode.ExtensionContext): void {
  // Create diagnostic collection
  diagnosticsCollection = vscode.languages.createDiagnosticCollection("mustache-json-validator");
  context.subscriptions.push(diagnosticsCollection);

  // Initialize services
  mustacheValidator = new MustacheValidator();
  jsonValidator = new JSONValidator();
  diagnosticsProvider = new DiagnosticsProvider(diagnosticsCollection);
}

/**
 * Get document selector for supported file types
 */
function getDocumentSelector(): vscode.DocumentSelector {
  return [
    { language: "mustache-json", scheme: "file" },
    { pattern: "**/*.mustache.json", scheme: "file" },
    { pattern: "**/*.mst.json", scheme: "file" },
    { pattern: "**/*.mustache", scheme: "file" },
  ];
}

/**
 * Register formatting providers
 */
function registerFormattingProviders(context: vscode.ExtensionContext, documentSelector: vscode.DocumentSelector): void {
  const documentFormattingProvider = new MustacheJSONDocumentFormattingProvider();
  const rangeFormattingProvider = new MustacheJSONDocumentRangeFormattingProvider();
  const onTypeFormattingProvider = new MustacheJSONOnTypeFormattingProvider();

  // Document formatting (Shift+Alt+F)
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(documentSelector, documentFormattingProvider));

  // Range formatting
  context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(documentSelector, rangeFormattingProvider));

  // On-type formatting
  context.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(documentSelector, onTypeFormattingProvider, "}", ":", ",")
  );
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Manual validation command
  const validateCommand = vscode.commands.registerCommand("mustacheJsonValidator.validate", async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    if (!isSupported(activeEditor.document)) {
      vscode.window.showWarningMessage("Current file is not a supported Mustache JSON template");
      return;
    }

    await validateDocument(activeEditor.document);
    vscode.window.showInformationMessage("Validation complete");
  });

  // Preview generated JSON command
  const previewCommand = vscode.commands.registerCommand("mustacheJsonValidator.preview", async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    if (!isSupported(activeEditor.document)) {
      vscode.window.showWarningMessage("Current file is not a supported Mustache JSON template");
      return;
    }

    await previewGeneratedJson(activeEditor.document);
  });

  // Format document command
  const formatCommand = vscode.commands.registerCommand("mustacheJsonValidator.format", async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    if (!isSupported(activeEditor.document)) {
      vscode.window.showWarningMessage("Current file is not a supported Mustache JSON template");
      return;
    }

    await formatActiveDocument(activeEditor);
  });

  // Clear diagnostics command
  const clearDiagnosticsCommand = vscode.commands.registerCommand("mustacheJsonValidator.clearDiagnostics", () => {
    diagnosticsProvider.clearAllDiagnostics();
    vscode.window.showInformationMessage("All diagnostics cleared");
  });

  context.subscriptions.push(validateCommand, previewCommand, formatCommand, clearDiagnosticsCommand);
}

/**
 * Register event listeners
 */
function registerEventListeners(context: vscode.ExtensionContext): void {
  // Document change listener with debouncing
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
    if (!isSupported(event.document)) {
      return;
    }

    const config = vscode.workspace.getConfiguration("mustacheJsonValidator");
    if (!config.get<boolean>("enableRealTimeValidation", true)) {
      return;
    }

    // Debounce validation to avoid excessive processing
    const uri = event.document.uri.toString();
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      validateDocument(event.document);
      validationTimers.delete(uri);
    }, 500);

    validationTimers.set(uri, timer);
  });

  // Document open listener
  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
    if (isSupported(document)) {
      validateDocument(document);
    }
  });

  // Document save listener
  const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument((document) => {
    if (isSupported(document)) {
      validateDocument(document);
    }
  });

  // Document close listener - clean up diagnostics
  const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument((document) => {
    if (isSupported(document)) {
      diagnosticsProvider.clearDiagnostics(document.uri);
      const uri = document.uri.toString();
      const timer = validationTimers.get(uri);
      if (timer) {
        clearTimeout(timer);
        validationTimers.delete(uri);
      }
    }
  });

  context.subscriptions.push(onDidChangeTextDocument, onDidOpenTextDocument, onDidSaveTextDocument, onDidCloseTextDocument);
}

/**
 * Check if document is supported by the extension
 */
function isSupported(document: vscode.TextDocument): boolean {
  const supportedLanguages = ["mustache-json", "mustache"];
  const supportedExtensions = [".mustache.json", ".mst.json", ".mustache"];

  return supportedLanguages.includes(document.languageId) || supportedExtensions.some((ext) => document.fileName.endsWith(ext));
}

/**
 * Validate all currently open documents
 */
function validateOpenDocuments(): void {
  vscode.workspace.textDocuments.forEach((document) => {
    if (isSupported(document)) {
      validateDocument(document);
    }
  });
}

/**
 * Main document validation function
 */
async function validateDocument(document: vscode.TextDocument): Promise<void> {
  const text = document.getText();
  try {
    // Collect all validation errors first
    const allErrors: any[] = [];

    // Validate Mustache syntax
    const mustacheResult = await mustacheValidator.validate(text, document);
    if (mustacheResult && mustacheResult.errors && Array.isArray(mustacheResult.errors)) {
      allErrors.push(...mustacheResult.errors);
    }

    // Validate JSON structure if possible
    try {
      const context = await getContextData();
      // Pass context as a separate parameter, not in options
      const jsonResult = await jsonValidator.validate(text, document, {
        allowTrailingComma: false,
        allowComments: false,
        validateSchema: false,
      });
      if (jsonResult && jsonResult.errors && Array.isArray(jsonResult.errors)) {
        allErrors.push(...jsonResult.errors);
      }
    } catch (jsonError) {
      // JSON validation failed - add a validation error for it
      allErrors.push({
        message: `JSON structure validation failed: ${jsonError}`,
        line: 1,
        column: 0,
        severity: "warning",
        code: "json-validation-failed",
      });
    }

    // Update diagnostics with ValidationError array
    diagnosticsProvider.updateDiagnostics(document.uri, allErrors);
  } catch (error) {
    console.error("Error validating document:", error);
    vscode.window.showErrorMessage(`Validation error: ${error}`);
  }
}

/**
 * Create VSCode diagnostic from validation error
 */
function createDiagnostic(document: vscode.TextDocument, error: any): vscode.Diagnostic {
  let range: vscode.Range;

  if (error.range) {
    range = new vscode.Range(error.range.start.line, error.range.start.character, error.range.end.line, error.range.end.character);
  } else if (error.line !== undefined && error.column !== undefined) {
    const line = Math.max(0, error.line - 1); // Convert to 0-based
    const character = Math.max(0, error.column);
    const endCharacter = character + (error.length || 1);
    range = new vscode.Range(line, character, line, endCharacter);
  } else {
    // Fallback to document start
    range = new vscode.Range(0, 0, 0, 1);
  }

  const severity =
    error.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : error.severity === "warning"
      ? vscode.DiagnosticSeverity.Warning
      : error.severity === "info"
      ? vscode.DiagnosticSeverity.Information
      : vscode.DiagnosticSeverity.Hint;

  const diagnostic = new vscode.Diagnostic(range, error.message, severity);
  diagnostic.source = "mustache-json-validator";

  if (error.code) {
    diagnostic.code = error.code;
  }

  return diagnostic;
}

/**
 * Format the active document
 */
async function formatActiveDocument(activeEditor: vscode.TextEditor): Promise<void> {
  try {
    // Use VSCode's built-in formatting command which will call our registered providers
    await vscode.commands.executeCommand("editor.action.formatDocument");
    vscode.window.showInformationMessage("Document formatted successfully");
  } catch (error) {
    console.error("Formatting error:", error);
    vscode.window.showErrorMessage(`Formatting error: ${error}`);
  }
}

/**
 * Preview generated JSON
 */
async function previewGeneratedJson(document: vscode.TextDocument): Promise<void> {
  try {
    const text = document.getText();
    const context = await getContextData();

    // Simple Mustache rendering - in production you'd use a proper template engine
    let renderedJson = text;

    // Basic variable substitution (this is a simplified approach)
    Object.keys(context).forEach((key) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      const value = typeof context[key] === "string" ? `"${context[key]}"` : JSON.stringify(context[key]);
      renderedJson = renderedJson.replace(regex, value);
    });

    // Parse and format the JSON
    const parsedJson = JSON.parse(renderedJson);
    const formattedJson = JSON.stringify(parsedJson, null, 2);

    // Create preview document
    const previewDoc = await vscode.workspace.openTextDocument({
      content: formattedJson,
      language: "json",
    });

    // Show in new editor column
    await vscode.window.showTextDocument(previewDoc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });

    vscode.window.showInformationMessage("JSON preview generated successfully");
  } catch (error) {
    console.error("Preview error:", error);
    vscode.window.showErrorMessage(`Preview error: ${error}`);
  }
}

/**
 * Get context data for template rendering
 */
async function getContextData(): Promise<any> {
  try {
    const config = vscode.workspace.getConfiguration("mustacheJsonValidator");
    const contextFile = config.get<string>("contextFile");

    if (contextFile) {
      return await loadContextFile(contextFile);
    }

    // Try to find common context files
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const commonFiles = ["context.json", "data.json", "sample-data.json", "test-data.json"];

      for (const fileName of commonFiles) {
        try {
          const filePath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), fileName);
          const content = await vscode.workspace.fs.readFile(filePath);
          const text = Buffer.from(content).toString("utf8");
          return JSON.parse(text);
        } catch {
          // File doesn't exist or isn't valid JSON, continue
        }
      }
    }

    // Return empty context as fallback
    return {};
  } catch (error) {
    console.warn("Failed to load context data, using empty context:", error);
    return {};
  }
}

/**
 * Load context file from specified path
 */
async function loadContextFile(contextFile: string): Promise<any> {
  try {
    const uri = vscode.Uri.file(contextFile);
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString("utf8");
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to load context file ${contextFile}: ${error}`);
  }
}
