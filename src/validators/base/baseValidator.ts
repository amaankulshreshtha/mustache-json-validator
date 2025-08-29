import * as vscode from "vscode";
import { ValidationError, ValidationResult, ValidationSeverity, ValidationTag } from "../../core/types";
import { PERFORMANCE_LIMITS } from "../../core/constants";

export abstract class BaseValidator {
  protected readonly name: string;
  protected readonly source: string;

  constructor(name: string, source: string) {
    this.name = name;
    this.source = source;
  }

  /**
   * Main validation method - to be implemented by concrete validators
   */
  public abstract validate(text: string, document?: vscode.TextDocument): Promise<ValidationResult>;

  /**
   * Quick synchronous validation check
   */
  public abstract validateSync(text: string): ValidationError[];

  /**
   * Validate with performance monitoring
   */
  public async validateWithTiming(text: string, document?: vscode.TextDocument): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([this.validate(text, document), this.createTimeoutPromise()]);

      const processingTime = Date.now() - startTime;

      return {
        ...result,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      return {
        errors: [
          this.createValidationError(`Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`, 1, 0, "error"),
        ],
        isValid: false,
        processingTime,
      };
    }
  }

  /**
   * Create a standardized validation error
   */
  protected createValidationError(
    message: string,
    line: number,
    column: number,
    severity: ValidationSeverity,
    length?: number,
    code?: string,
    tags?: ValidationTag[]
  ): ValidationError {
    return {
      message,
      line,
      column,
      severity,
      length,
      code,
      source: this.source,
      tags,
    };
  }

  /**
   * Create a VSCode diagnostic from validation error
   */
  protected createDiagnostic(error: ValidationError, document?: vscode.TextDocument): vscode.Diagnostic {
    const line = Math.max(0, error.line - 1);
    const column = Math.max(0, error.column);
    const length = error.length || 1;

    // Create range - handle end of line cases
    let endLine = line;
    let endColumn = column + length;

    if (document) {
      const lineText = document.lineAt(line).text;
      endColumn = Math.min(endColumn, lineText.length);
    }

    const range = new vscode.Range(new vscode.Position(line, column), new vscode.Position(endLine, endColumn));

    const severity = this.convertSeverity(error.severity);
    const diagnostic = new vscode.Diagnostic(range, error.message, severity);

    // Add additional properties
    if (error.code) {
      diagnostic.code = error.code;
    }

    if (error.source) {
      diagnostic.source = error.source;
    }

    if (error.tags) {
      diagnostic.tags = this.convertTags(error.tags);
    }

    return diagnostic;
  }

  /**
   * Convert multiple validation errors to diagnostics
   */
  protected createDiagnostics(errors: ValidationError[], document?: vscode.TextDocument): vscode.Diagnostic[] {
    return errors.map((error) => this.createDiagnostic(error, document));
  }

  /**
   * Find text position from line/column
   */
  protected getTextPosition(text: string, line: number, column: number): number {
    const lines = text.split("\n");
    let position = 0;

    for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
      position += lines[i].length + 1; // +1 for newline
    }

    return position + column;
  }

  /**
   * Get line/column from text position
   */
  protected getLineColumnFromPosition(text: string, position: number): { line: number; column: number } {
    const textBeforePosition = text.substring(0, position);
    const lines = textBeforePosition.split("\n");

    return {
      line: lines.length,
      column: lines[lines.length - 1].length,
    };
  }

  /**
   * Extract text range
   */
  protected extractTextRange(text: string, startLine: number, startColumn: number, endLine: number, endColumn: number): string {
    const lines = text.split("\n");

    if (startLine === endLine) {
      return lines[startLine - 1]?.substring(startColumn, endColumn) || "";
    }

    let result = "";
    for (let i = startLine - 1; i <= endLine - 1 && i < lines.length; i++) {
      if (i === startLine - 1) {
        result += lines[i].substring(startColumn) + "\n";
      } else if (i === endLine - 1) {
        result += lines[i].substring(0, endColumn);
      } else {
        result += lines[i] + "\n";
      }
    }

    return result;
  }

  /**
   * Check if file size is within limits
   */
  protected isFileSizeAcceptable(text: string): boolean {
    const sizeInMB = Buffer.byteLength(text, "utf8") / (1024 * 1024);
    return sizeInMB <= PERFORMANCE_LIMITS.MAX_FILE_SIZE_MB;
  }

  /**
   * Create a validation result
   */
  protected createValidationResult(errors: ValidationError[], processingTime?: number): ValidationResult {
    return {
      errors,
      isValid: errors.filter((e) => e.severity === "error").length === 0,
      processingTime,
    };
  }

  /**
   * Merge validation results from multiple sources
   */
  protected mergeValidationResults(...results: ValidationResult[]): ValidationResult {
    const allErrors: ValidationError[] = [];
    let totalProcessingTime = 0;
    let isValid = true;

    for (const result of results) {
      allErrors.push(...result.errors);

      if (!result.isValid) {
        isValid = false;
      }

      if (result.processingTime) {
        totalProcessingTime += result.processingTime;
      }
    }

    return {
      errors: this.deduplicateErrors(allErrors),
      isValid,
      processingTime: totalProcessingTime,
    };
  }

  /**
   * Remove duplicate validation errors
   */
  protected deduplicateErrors(errors: ValidationError[]): ValidationError[] {
    const seen = new Set<string>();
    const deduplicated: ValidationError[] = [];

    for (const error of errors) {
      const key = `${error.line}:${error.column}:${error.message}:${error.severity}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(error);
      }
    }

    return deduplicated;
  }

  /**
   * Sort errors by line and column
   */
  protected sortErrors(errors: ValidationError[]): ValidationError[] {
    return errors.sort((a, b) => {
      if (a.line !== b.line) {
        return a.line - b.line;
      }
      return a.column - b.column;
    });
  }

  /**
   * Filter errors by severity
   */
  protected filterErrorsBySeverity(errors: ValidationError[], minSeverity: ValidationSeverity): ValidationError[] {
    const severityOrder = ["hint", "info", "warning", "error"];
    const minIndex = severityOrder.indexOf(minSeverity);

    return errors.filter((error) => {
      const errorIndex = severityOrder.indexOf(error.severity);
      return errorIndex >= minIndex;
    });
  }

  /**
   * Convert validation severity to VSCode diagnostic severity
   */
  private convertSeverity(severity: ValidationSeverity): vscode.DiagnosticSeverity {
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
   * Convert validation tags to VSCode diagnostic tags
   */
  private convertTags(tags: ValidationTag[]): vscode.DiagnosticTag[] {
    const vscTags: vscode.DiagnosticTag[] = [];

    for (const tag of tags) {
      switch (tag) {
        case ValidationTag.Style:
          vscTags.push(vscode.DiagnosticTag.Unnecessary);
          break;
        // Add more tag conversions as needed
      }
    }

    return vscTags;
  }

  /**
   * Create timeout promise for performance limits
   */
  private createTimeoutPromise(): Promise<ValidationResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Validation timeout after ${PERFORMANCE_LIMITS.MAX_VALIDATION_TIME_MS}ms`));
      }, PERFORMANCE_LIMITS.MAX_VALIDATION_TIME_MS);
    });
  }
}
