import * as vscode from "vscode";
import { FormatterService } from "../services/formatterService";

export class MustacheJSONDocumentFormattingProvider implements vscode.DocumentFormattingEditProvider {
  private formatter: FormatterService;

  constructor() {
    this.formatter = new FormatterService();
  }

  /**
   * Provide formatting edits for a document
   */
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const text = document.getText();

    // Get formatting options
    const formatterOptions = {
      indentSize: options.tabSize,
      insertFinalNewline: Boolean(options.insertFinalNewline ?? true),
      trimTrailingWhitespace: true,
      insertSpacesAroundMustacheTags: vscode.workspace.getConfiguration("mustacheJsonValidator").get("formatter.spacesAroundTags", false),
    };

    // Format the text
    const formatted = this.formatter.formatDocument(text, formatterOptions);

    // Return text edit for entire document
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));

    return [vscode.TextEdit.replace(fullRange, formatted)];
  }
}

export class MustacheJSONDocumentRangeFormattingProvider implements vscode.DocumentRangeFormattingEditProvider {
  private formatter: FormatterService;

  constructor() {
    this.formatter = new FormatterService();
  }

  /**
   * Provide formatting edits for a document range
   */
  public provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const text = document.getText(range);

    // Get formatting options
    const formatterOptions = {
      indentSize: options.tabSize,
      insertFinalNewline: false, // Don't add newline for range formatting
      trimTrailingWhitespace: true,
      insertSpacesAroundMustacheTags: vscode.workspace.getConfiguration("mustacheJsonValidator").get("formatter.spacesAroundTags", false),
    };

    // Format the selected text
    const formatted = this.formatter.formatDocument(text, formatterOptions);

    return [vscode.TextEdit.replace(range, formatted)];
  }
}

export class MustacheJSONOnTypeFormattingProvider implements vscode.OnTypeFormattingEditProvider {
  private formatter: FormatterService;

  constructor() {
    this.formatter = new FormatterService();
  }

  /**
   * Provide formatting edits after typing specific characters
   */
  public provideOnTypeFormattingEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    ch: string,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];

    // Get current line
    const line = document.lineAt(position);
    const lineText = line.text;

    switch (ch) {
      case "}":
        // Handle closing brace formatting
        if (lineText.trim().endsWith("}}")) {
          const formatted = this.formatMustacheLine(lineText, options);
          if (formatted !== lineText) {
            edits.push(vscode.TextEdit.replace(line.range, formatted));
          }
        } else if (lineText.trim().endsWith("}")) {
          // JSON closing brace - adjust indentation
          const indented = this.adjustIndentation(lineText, options, -1);
          if (indented !== lineText) {
            edits.push(vscode.TextEdit.replace(line.range, indented));
          }
        }
        break;

      case ":":
        // Add space after colon in JSON
        const colonFormatted = this.formatColonSpacing(lineText);
        if (colonFormatted !== lineText) {
          edits.push(vscode.TextEdit.replace(line.range, colonFormatted));
        }
        break;

      case ",":
        // Format comma spacing
        const commaFormatted = this.formatCommaSpacing(lineText);
        if (commaFormatted !== lineText) {
          edits.push(vscode.TextEdit.replace(line.range, commaFormatted));
        }
        break;
    }

    return edits;
  }

  /**
   * Format Mustache line
   */
  private formatMustacheLine(lineText: string, options: vscode.FormattingOptions): string {
    const config = vscode.workspace.getConfiguration("mustacheJsonValidator");
    const spacesAroundTags = config.get("formatter.spacesAroundTags", false);

    if (spacesAroundTags) {
      return lineText.replace(/\{\{([^}]*)\}\}/g, (match, content) => {
        const trimmed = content.trim();
        return `{{ ${trimmed} }}`;
      });
    }

    return lineText.replace(/\{\{\s+([^}]*)\s+\}\}/g, "{{$1}}");
  }

  /**
   * Adjust line indentation
   */
  private adjustIndentation(lineText: string, options: vscode.FormattingOptions, change: number): string {
    const trimmed = lineText.trim();
    if (!trimmed) {
      return lineText;
    }

    const currentIndent = lineText.length - lineText.trimStart().length;
    const indentSize = options.tabSize;
    const newIndent = Math.max(0, currentIndent + change * indentSize);

    return " ".repeat(newIndent) + trimmed;
  }

  /**
   * Format colon spacing
   */
  private formatColonSpacing(lineText: string): string {
    // Add space after colon if not already present (outside of strings and Mustache tags)
    return lineText.replace(/:\s*(?=[^"]*(?:"[^"]*"[^"]*)*$)(?![^{]*}})/g, ": ");
  }

  /**
   * Format comma spacing
   */
  private formatCommaSpacing(lineText: string): string {
    // Add space after comma if not already present (outside of strings and Mustache tags)
    return lineText.replace(/,\s*(?=[^"]*(?:"[^"]*"[^"]*)*$)(?![^{]*}})/g, ", ");
  }
}
