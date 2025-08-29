import * as vscode from "vscode";
import { TemplateEngine } from "../services/templateEngine";
import { ConfigurationManager } from "../core/config";
import { CommandContext, PreviewOptions } from "../core/types";

export class PreviewCommand {
  private templateEngine: TemplateEngine;
  private configManager: ConfigurationManager;
  private previewPanels = new Map<string, vscode.WebviewPanel>();

  constructor(templateEngine: TemplateEngine, configManager: ConfigurationManager) {
    this.templateEngine = templateEngine;
    this.configManager = configManager;
  }

  /**
   * Execute preview command
   */
  public async execute(context?: CommandContext, options?: PreviewOptions): Promise<void> {
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

    await this.showPreview(document, options);
  }

  /**
   * Show JSON preview
   */
  private async showPreview(document: vscode.TextDocument, options?: PreviewOptions): Promise<void> {
    try {
      const text = document.getText();

      // Show progress for template rendering
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating JSON preview...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 50, message: "Rendering template..." });

          const renderResult = await this.templateEngine.renderTemplate(text);

          progress.report({ increment: 50, message: "Formatting output..." });

          return renderResult;
        }
      );

      if (result.success && result.output) {
        // Choose preview method based on options
        if (options?.showInSidePanel) {
          await this.showWebviewPreview(document, result.output, options);
        } else {
          await this.showTextDocumentPreview(result.output, options);
        }
      } else {
        await this.showPreviewError(result.error || "Unknown rendering error", document);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Preview failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Show preview in a text document
   */
  private async showTextDocumentPreview(output: string, options?: PreviewOptions): Promise<void> {
    try {
      // Format the JSON output
      const formatted = options?.formatOutput !== false ? this.templateEngine.formatOutput(output, "json") : output;

      // Create preview document
      const previewDoc = await vscode.workspace.openTextDocument({
        content: formatted,
        language: "json",
      });

      // Show in editor
      await vscode.window.showTextDocument(previewDoc, vscode.ViewColumn.Beside);
    } catch (error) {
      throw new Error(`Failed to create preview document: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Show preview in webview panel
   */
  private async showWebviewPreview(document: vscode.TextDocument, output: string, options?: PreviewOptions): Promise<void> {
    const documentUri = document.uri.toString();

    // Check if preview panel already exists
    let panel = this.previewPanels.get(documentUri);

    if (!panel) {
      // Create new webview panel
      panel = vscode.window.createWebviewPanel("mustacheJsonPreview", `JSON Preview: ${document.fileName}`, vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      });

      // Handle panel disposal
      panel.onDidDispose(() => {
        this.previewPanels.delete(documentUri);
      });

      this.previewPanels.set(documentUri, panel);
    }

    // Update webview content
    panel.webview.html = this.generateWebviewContent(output, document.fileName, options);

    // Reveal the panel
    panel.reveal(vscode.ViewColumn.Beside);
  }

  /**
   * Generate HTML content for webview
   */
  private generateWebviewContent(jsonOutput: string, fileName: string, options?: PreviewOptions): string {
    const formatted = this.templateEngine.formatOutput(jsonOutput, "json");
    const autoRefresh = options?.autoRefresh ? "true" : "false";
    const escapedJson = this.escapeHtml(formatted);
    const escapedFileName = this.escapeHtml(fileName);
    const downloadName = fileName.replace(/\.[^/.]+$/, "") + "_output.json";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Preview: ${escapedFileName}</title>
    <style>
        body {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .title {
            font-size: 18px;
            font-weight: bold;
        }

        .controls {
            display: flex;
            gap: 10px;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .json-container {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            overflow: auto;
            max-height: calc(100vh - 120px);
        }

        .json-content {
            white-space: pre-wrap;
            font-size: 14px;
            line-height: 1.4;
            margin: 0;
        }

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            padding: 16px;
            border-radius: 4px;
            margin-top: 20px;
        }

        .stats {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">JSON Preview: ${escapedFileName}</div>
        <div class="controls">
            <button onclick="copyToClipboard()">📋 Copy</button>
            <button onclick="downloadJson()">💾 Download</button>
            <button onclick="refreshPreview()">🔄 Refresh</button>
        </div>
    </div>

    <div class="json-container">
        <pre class="json-content" id="jsonContent">${escapedJson}</pre>
    </div>

    <div class="stats">
        Generated: ${new Date().toLocaleString()} |
        Size: ${formatted.length} characters |
        Lines: ${formatted.split("\n").length}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const autoRefresh = ${autoRefresh};

        function copyToClipboard() {
            const content = document.getElementById('jsonContent').textContent;
            navigator.clipboard.writeText(content).then(() => {
                vscode.postMessage({ command: 'showMessage', text: 'JSON copied to clipboard!' });
            }).catch(() => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = content;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                vscode.postMessage({ command: 'showMessage', text: 'JSON copied to clipboard!' });
            });
        }

        function downloadJson() {
            const content = document.getElementById('jsonContent').textContent;
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '${downloadName}';
            a.click();
            URL.revokeObjectURL(url);
        }

        function refreshPreview() {
            vscode.postMessage({ command: 'refresh' });
        }

        // Auto-refresh if enabled
        if (autoRefresh) {
            setInterval(() => {
                vscode.postMessage({ command: 'autoRefresh' });
            }, 2000);
        }
    </script>
</body>
</html>`;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * Show preview error
   */
  private async showPreviewError(error: string, document: vscode.TextDocument): Promise<void> {
    const choice = await vscode.window.showErrorMessage(`Failed to generate JSON preview: ${error}`, "Show Template Issues", "Ignore");

    if (choice === "Show Template Issues") {
      vscode.commands.executeCommand("workbench.action.showErrorsWarnings");
    }
  }

  /**
   * Check if document is valid for preview
   */
  private isValidDocument(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    const validExtensions = [".mustache", ".mustache.json", ".mst.json"];

    return (
      validExtensions.some((ext) => fileName.endsWith(ext)) || document.languageId === "mustache-json" || document.languageId === "mustache"
    );
  }

  /**
   * Update preview for document
   */
  public async updatePreview(document: vscode.TextDocument): Promise<void> {
    const documentUri = document.uri.toString();
    const panel = this.previewPanels.get(documentUri);

    if (panel && panel.visible) {
      await this.showPreview(document, { showInSidePanel: true });
    }
  }

  /**
   * Dispose all preview panels
   */
  public dispose(): void {
    for (const panel of this.previewPanels.values()) {
      panel.dispose();
    }
    this.previewPanels.clear();
  }
}
