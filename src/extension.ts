import * as vscode from "vscode";
import { MustacheValidator } from "./validators/mustache/mustacheValidator";
import { JSONValidator } from "./validators/json/jsonValidator";
import { DiagnosticsProvider } from "./providers/diagnosticsProvider";
import { TemplateEngine } from "./services/templateEngine";
import { ConfigurationManager } from "./core/config";
import { ExtensionConfig, ValidationResult, DocumentChangeEvent } from "./core/types";
import { EXTENSION_ID, COMMANDS, FILE_EXTENSIONS, PERFORMANCE_LIMITS } from "./core/constants";

// Global extension state
let diagnosticsCollection: vscode.DiagnosticCollection;
let mustacheValidator: MustacheValidator;
let jsonValidator: JSONValidator;
let diagnosticsProvider: DiagnosticsProvider;
let templateEngine: TemplateEngine;
let configManager: ConfigurationManager;

// Validation debounce timers
const validationTimers = new Map<string, NodeJS.Timeout>();

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`🚀 ${EXTENSION_ID} is activating...`);

  try {
    // Initialize core services
    await initializeServices(context);

    // Register event listeners
    registerEventListeners(context);

    // Register commands
    registerCommands(context);

    // Register providers
    registerProviders(context);

    // Validate open documents
    await validateOpenDocuments();

    console.log(`✅ ${EXTENSION_ID} activated successfully!`);

    // Show welcome message for first-time users
    showWelcomeMessage(context);
  } catch (error) {
    console.error(`❌ Failed to activate ${EXTENSION_ID}:`, error);
    vscode.window.showErrorMessage(
      `Failed to activate Mustache JSON Validator: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Initialize core services
 */
async function initializeServices(context: vscode.ExtensionContext): Promise<void> {
  // Create diagnostic collection
  diagnosticsCollection = vscode.languages.createDiagnosticCollection("mustache-json");
  context.subscriptions.push(diagnosticsCollection);

  // Initialize configuration manager
  configManager = ConfigurationManager.getInstance();

  // Initialize validators
  mustacheValidator = new MustacheValidator();
  jsonValidator = new JSONValidator();

  // Initialize providers
  diagnosticsProvider = new DiagnosticsProvider(diagnosticsCollection);
  context.subscriptions.push(diagnosticsProvider);

  // Initialize services
  templateEngine = new TemplateEngine();
  context.subscriptions.push(templateEngine);
}

/**
 * Register event listeners
 */
function registerEventListeners(context: vscode.ExtensionContext): void {
  // Document change listener for real-time validation
  const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    handleDocumentChange(event);
  });

  // Document open listener
  const documentOpenListener = vscode.workspace.onDidOpenTextDocument((document) => {
    if (isMustacheDocument(document)) {
      validateDocumentDelayed(document, 100); // Quick validation on open
    }
  });

  // Document save listener
  const documentSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    if (isMustacheDocument(document)) {
      validateDocument(document); // Immediate validation on save
    }
  });

  // Document close listener
  const documentCloseListener = vscode.workspace.onDidCloseTextDocument((document) => {
    if (isMustacheDocument(document)) {
      diagnosticsProvider.clearDiagnostics(document.uri);
      clearValidationTimer(document.uri.toString());
    }
  });

  // Active editor change listener
  const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && isMustacheDocument(editor.document)) {
      validateDocumentDelayed(editor.document, 200);
    }
  });

  // Configuration change listener
  const configChangeListener = configManager.onConfigChanged((config) => {
    handleConfigurationChange(config);
  });

  // Add to subscriptions
  context.subscriptions.push(
    documentChangeListener,
    documentOpenListener,
    documentSaveListener,
    documentCloseListener,
    activeEditorChangeListener,
    configChangeListener
  );
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Validate command
  const validateCommand = vscode.commands.registerCommand(COMMANDS.VALIDATE, async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isMustacheDocument(activeEditor.document)) {
      await validateDocument(activeEditor.document);
      vscode.window.showInformationMessage("✅ Validation complete");
    } else {
      vscode.window.showWarningMessage("No Mustache template file is currently active");
    }
  });

  // Preview JSON command
  const previewCommand = vscode.commands.registerCommand(COMMANDS.PREVIEW, async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isMustacheDocument(activeEditor.document)) {
      await previewGeneratedJSON(activeEditor.document);
    } else {
      vscode.window.showWarningMessage("No Mustache template file is currently active");
    }
  });

  // Format command
  const formatCommand = vscode.commands.registerCommand(COMMANDS.FORMAT, async () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isMustacheDocument(activeEditor.document)) {
      await formatDocument(activeEditor);
    } else {
      vscode.window.showWarningMessage("No Mustache template file is currently active");
    }
  });

  // Select context file command
  const selectContextCommand = vscode.commands.registerCommand(COMMANDS.SELECT_CONTEXT, async () => {
    await selectContextFile();
  });

  // Clear cache command
  const clearCacheCommand = vscode.commands.registerCommand(COMMANDS.CLEAR_CACHE, async () => {
    templateEngine.clearCache();
    vscode.window.showInformationMessage("🗑️ Validation cache cleared");
  });

  // Toggle real-time validation command
  const toggleValidationCommand = vscode.commands.registerCommand(COMMANDS.TOGGLE_VALIDATION, async () => {
    const enabled = await configManager.toggleRealTimeValidation();
    vscode.window.showInformationMessage(`Real-time validation ${enabled ? "enabled" : "disabled"}`);
  });

  // Add to subscriptions
  context.subscriptions.push(
    validateCommand,
    previewCommand,
    formatCommand,
    selectContextCommand,
    clearCacheCommand,
    toggleValidationCommand
  );
}

/**
 * Register language providers
 */
function registerProviders(context: vscode.ExtensionContext): void {
  // Document selector for Mustache files
  const documentSelector: vscode.DocumentSelector = [
    { language: "mustache-json" },
    { pattern: "**/*.mustache.json" },
    { pattern: "**/*.mst.json" },
    { pattern: "**/*.mustache" },
  ];

  // Additional providers can be registered here in the future:
  // - Completion provider
  // - Hover provider
  // - Code action provider
  // - Formatting provider
}

/**
 * Handle document changes
 */
function handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
  const document = event.document;

  if (!isMustacheDocument(document)) {
    return;
  }

  const config = configManager.getConfig();
  if (!config.enableRealTimeValidation) {
    return;
  }

  // Debounce validation to avoid excessive calls
  const debounceTime = Math.max(config.debounceTime, 100);
  validateDocumentDelayed(document, debounceTime);
}

/**
 * Validate document with debouncing
 */
function validateDocumentDelayed(document: vscode.TextDocument, delay: number): void {
  const documentUri = document.uri.toString();

  // Clear existing timer
  clearValidationTimer(documentUri);

  // Set new timer
  const timer = setTimeout(() => {
    validateDocument(document);
    validationTimers.delete(documentUri);
  }, delay);

  validationTimers.set(documentUri, timer);
}

/**
 * Clear validation timer for document
 */
function clearValidationTimer(documentUri: string): void {
  const timer = validationTimers.get(documentUri);
  if (timer) {
    clearTimeout(timer);
    validationTimers.delete(documentUri);
  }
}

/**
 * Main document validation logic
 */
async function validateDocument(document: vscode.TextDocument): Promise<void> {
  if (!isMustacheDocument(document)) {
    return;
  }

  try {
    const text = document.getText();
    const errors: any[] = [];

    // Validate Mustache template
    const mustacheResult = await mustacheValidator.validateWithTiming(text, document);
    errors.push(...mustacheResult.errors);

    // If Mustache is valid, try to generate and validate JSON
    const config = configManager.getConfig();
    if (config.validateJsonOutput && mustacheResult.isValid) {
      const renderResult = await templateEngine.renderTemplate(text);

      if (renderResult.success && renderResult.output) {
        const jsonResult = await jsonValidator.validateWithTiming(renderResult.output, document);
        errors.push(...jsonResult.errors);
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

    // Update diagnostics
    diagnosticsProvider.updateDiagnostics(document.uri, errors);
  } catch (error) {
    console.error("Validation error:", error);

    // Show error diagnostic
    const errorDiagnostic = {
      message: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      line: 1,
      column: 0,
      severity: "error" as const,
      source: "mustache-validator",
    };

    diagnosticsProvider.updateDiagnostics(document.uri, [errorDiagnostic]);
  }
}

/**
 * Preview generated JSON
 */
async function previewGeneratedJSON(document: vscode.TextDocument): Promise<void> {
  try {
    const text = document.getText();
    const renderResult = await templateEngine.renderTemplate(text);

    if (renderResult.success && renderResult.output) {
      // Format the JSON output
      const formattedOutput = templateEngine.formatOutput(renderResult.output, "json");

      // Create and show preview document
      const previewDoc = await vscode.workspace.openTextDocument({
        content: formattedOutput,
        language: "json",
      });

      await vscode.window.showTextDocument(previewDoc, vscode.ViewColumn.Beside);
    } else {
      vscode.window.showErrorMessage(`Failed to generate JSON: ${renderResult.error || "Unknown error"}`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Preview failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Format document
 */
async function formatDocument(editor: vscode.TextEditor): Promise<void> {
  try {
    const document = editor.document;
    const text = document.getText();

    // Generate formatted output
    const renderResult = await templateEngine.renderTemplate(text);

    if (renderResult.success && renderResult.output) {
      const formatted = templateEngine.formatOutput(renderResult.output, "json");

      // Show formatted result
      const choice = await vscode.window.showInformationMessage(
        "Format preview ready. Replace current content?",
        "Replace",
        "Show Preview",
        "Cancel"
      );

      if (choice === "Replace") {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
        edit.replace(document.uri, fullRange, formatted);
        await vscode.workspace.applyEdit(edit);
      } else if (choice === "Show Preview") {
        await previewGeneratedJSON(document);
      }
    } else {
      vscode.window.showErrorMessage("Cannot format: template rendering failed");
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Format failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Select context file
 */
async function selectContextFile(): Promise<void> {
  try {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: "Select Context File",
      filters: {
        "JSON Files": ["json"],
      },
    };

    const fileUri = await vscode.window.showOpenDialog(options);

    if (fileUri && fileUri[0]) {
      await configManager.setContextFile(fileUri[0].fsPath);
      vscode.window.showInformationMessage(`Context file set: ${fileUri[0].fsPath}`);

      // Re-validate open documents with new context
      await validateOpenDocuments();
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to select context file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle configuration changes
 */
function handleConfigurationChange(config: ExtensionConfig): void {
  // Re-validate all open documents with new configuration
  if (config.enableRealTimeValidation) {
    validateOpenDocuments();
  } else {
    // Clear all diagnostics if validation is disabled
    diagnosticsProvider.clearAllDiagnostics();
  }
}

/**
 * Validate all open documents
 */
async function validateOpenDocuments(): Promise<void> {
  const documents = vscode.workspace.textDocuments.filter(isMustacheDocument);

  for (const document of documents) {
    await validateDocument(document);
  }
}

/**
 * Check if document is a Mustache template
 */
function isMustacheDocument(document: vscode.TextDocument): boolean {
  // Check language ID
  if (document.languageId === "mustache-json" || document.languageId === "mustache") {
    return true;
  }

  // Check file extension
  const fileName = document.fileName.toLowerCase();
  if (FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    return true;
  }

  // Check if it's a regular .mustache file that looks like JSON
  if (fileName.endsWith(".mustache")) {
    const text = document.getText().trim();
    return text.startsWith("{") || text.startsWith("[");
  }

  return false;
}

/**
 * Show welcome message for new users
 */
function showWelcomeMessage(context: vscode.ExtensionContext): void {
  const hasShownWelcome = context.globalState.get("hasShownWelcome", false);

  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        "🎉 Welcome to Mustache JSON Validator! Open a .mustache.json file to get started.",
        "Open Settings",
        "View Examples"
      )
      .then((choice) => {
        if (choice === "Open Settings") {
          vscode.commands.executeCommand("workbench.action.openSettings", "mustacheJsonValidator");
        } else if (choice === "View Examples") {
          // Could open example files or documentation
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/mustache/mustache"));
        }
      });

    context.globalState.update("hasShownWelcome", true);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log(`🛑 ${EXTENSION_ID} is deactivating...`);

  // Clear all timers
  for (const timer of validationTimers.values()) {
    clearTimeout(timer);
  }
  validationTimers.clear();

  // Dispose services
  templateEngine?.dispose();
  diagnosticsProvider?.dispose();
  configManager?.dispose();

  console.log(`✅ ${EXTENSION_ID} deactivated successfully`);
}
