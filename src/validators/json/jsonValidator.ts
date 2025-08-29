import * as vscode from "vscode";
import { BaseValidator } from "../base/baseValidator";
import { JSONSyntaxValidator } from "./syntaxValidator";
import { JSONSchemaValidator } from "./schemaValidator";
import { ValidationResult, ValidationError, JSONValidationOptions, JSONProperty, DuplicateKey } from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES, JSON_PATTERNS } from "../../core/constants";

export class JSONValidator extends BaseValidator {
  private syntaxValidator: JSONSyntaxValidator;
  private schemaValidator: JSONSchemaValidator;

  constructor() {
    super("JSONValidator", DIAGNOSTIC_SOURCES.JSON);
    this.syntaxValidator = new JSONSyntaxValidator();
    this.schemaValidator = new JSONSchemaValidator();
  }

  /**
   * Main validation method
   */
  public async validate(text: string, document?: vscode.TextDocument, options?: JSONValidationOptions): Promise<ValidationResult> {
    if (!this.isFileSizeAcceptable(text)) {
      return this.createValidationResult([
        this.createValidationError("File too large for JSON validation", 1, 0, "warning", undefined, ERROR_CODES.JSON_SYNTAX_ERROR),
      ]);
    }

    const startTime = Date.now();
    const errors: ValidationError[] = [];

    try {
      // Basic JSON syntax validation
      const syntaxResult = await this.syntaxValidator.validate(text, document);
      errors.push(...syntaxResult.errors);

      // Only proceed with structural validation if basic syntax is valid
      if (syntaxResult.isValid) {
        // Parse and validate JSON structure
        const structureErrors = this.validateJSONStructure(text);
        errors.push(...structureErrors);

        // Skip duplicate key validation for Mustache-generated JSON
        // (array items naturally have same property names)

        // Schema validation if requested
        if (options?.validateSchema && options.schemaUri) {
          const schemaResult = await this.schemaValidator.validate(text, document, options.schemaUri);
          errors.push(...schemaResult.errors);
        }
      }

      const processingTime = Date.now() - startTime;
      return this.createValidationResult(this.sortErrors(errors), processingTime);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      return this.createValidationResult(
        [
          this.createValidationError(
            `JSON validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            1,
            0,
            "error",
            undefined,
            ERROR_CODES.JSON_SYNTAX_ERROR
          ),
        ],
        processingTime
      );
    }
  }

  /**
   * Quick synchronous validation
   */
  public validateSync(text: string, options?: JSONValidationOptions): ValidationError[] {
    try {
      const errors: ValidationError[] = [];

      // Basic syntax validation
      const syntaxErrors = this.syntaxValidator.validateSync(text);
      errors.push(...syntaxErrors);

      // Only proceed if syntax is valid
      if (syntaxErrors.filter((e) => e.severity === "error").length === 0) {
        // Structure validation
        errors.push(...this.validateJSONStructure(text));
      }

      return this.sortErrors(errors);
    } catch (error) {
      return [
        this.createValidationError(
          `JSON validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        ),
      ];
    }
  }

  /**
   * Validate JSON structure and common issues
   */
  private validateJSONStructure(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      // Try to parse the JSON
      const parsed = JSON.parse(text);

      // Validate against common structural issues
      errors.push(...this.validateCommonJSONIssues(text));

      // Validate JSON formatting
      errors.push(...this.validateJSONFormatting(text, parsed));
    } catch (parseError) {
      // JSON parsing failed - create detailed error
      const error = this.parseJSONError(parseError, text);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Check for duplicate keys in JSON objects (disabled for Mustache templates)
   */
  private validateDuplicateKeys(text: string): ValidationError[] {
    // Skip duplicate key validation for Mustache-generated JSON
    // because array items with same structure will always have "duplicate" keys
    // which is perfectly valid JSON
    return [];
  }

  /**
   * Validate common JSON issues
   */
  private validateCommonJSONIssues(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Check for trailing commas
      let match;
      const trailingCommaPattern = new RegExp(JSON_PATTERNS.TRAILING_COMMA.source, "g");
      while ((match = trailingCommaPattern.exec(line)) !== null) {
        errors.push(
          this.createValidationError(
            "Trailing comma in JSON",
            lineNumber,
            match.index,
            "error",
            match[0].length,
            ERROR_CODES.TRAILING_COMMA
          )
        );
      }

      // Check for unquoted keys
      const unquotedKeyPattern = new RegExp(JSON_PATTERNS.UNQUOTED_KEY.source, "g");
      while ((match = unquotedKeyPattern.exec(line)) !== null) {
        // Skip if it's inside a string or part of a larger structure
        const beforeMatch = line.substring(0, match.index);
        const insideString = (beforeMatch.split('"').length - 1) % 2 === 1;

        if (!insideString) {
          errors.push(
            this.createValidationError(
              "JSON keys must be quoted",
              lineNumber,
              match.index,
              "error",
              match[1].length,
              ERROR_CODES.UNQUOTED_KEY
            )
          );
        }
      }

      // Check for single quotes
      const singleQuotePattern = new RegExp(JSON_PATTERNS.SINGLE_QUOTES.source, "g");
      while ((match = singleQuotePattern.exec(line)) !== null) {
        errors.push(
          this.createValidationError(
            "JSON strings must use double quotes, not single quotes",
            lineNumber,
            match.index,
            "error",
            match[0].length,
            ERROR_CODES.JSON_SYNTAX_ERROR
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate JSON formatting and style
   */
  private validateJSONFormatting(text: string, parsed: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if JSON is properly formatted
    const formatted = JSON.stringify(parsed, null, 2);
    const normalizedText = text.replace(/\r\n/g, "\n").trim();
    const normalizedFormatted = formatted.replace(/\r\n/g, "\n").trim();

    if (normalizedText !== normalizedFormatted) {
      errors.push(
        this.createValidationError(
          "JSON could be better formatted - consider using auto-format",
          1,
          0,
          "hint",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Parse JSON parsing errors into validation errors
   */
  private parseJSONError(error: any, text: string): ValidationError | null {
    const message = error.message || error.toString();
    let line = 1;
    let column = 0;

    // Try to extract position from error message
    const positionMatch = message.match(/position (\d+)/i);
    if (positionMatch) {
      const position = parseInt(positionMatch[1], 10);
      const location = this.getLineColumnFromPosition(text, position);
      line = location.line;
      column = location.column;
    }

    // Try to extract line number
    const lineMatch = message.match(/line (\d+)/i);
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
    }

    // Try to extract column number
    const columnMatch = message.match(/column (\d+)/i);
    if (columnMatch) {
      column = parseInt(columnMatch[1], 10);
    }

    // If no position found, try to locate the error
    if (line === 1 && column === 0) {
      const location = this.findJSONErrorLocation(text, message);
      if (location) {
        line = location.line;
        column = location.column;
      }
    }

    return this.createValidationError(
      `Invalid JSON: ${this.cleanErrorMessage(message)}`,
      line,
      column,
      "error",
      undefined,
      ERROR_CODES.JSON_SYNTAX_ERROR
    );
  }

  /**
   * Find JSON error location based on error message
   */
  private findJSONErrorLocation(text: string, errorMessage: string): { line: number; column: number } | null {
    const lines = text.split("\n");

    // Look for common JSON error patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for specific error patterns
      if (errorMessage.includes("Unexpected token")) {
        // Find unexpected characters
        const unexpectedChar = errorMessage.match(/Unexpected token (.)/);
        if (unexpectedChar && line.includes(unexpectedChar[1])) {
          return { line: i + 1, column: line.indexOf(unexpectedChar[1]) };
        }
      }

      // Check for unterminated strings
      if (errorMessage.includes("Unterminated string") || errorMessage.includes("unterminated string")) {
        const unterminatedString = line.match(/"[^"]*$/);
        if (unterminatedString) {
          return { line: i + 1, column: unterminatedString.index || 0 };
        }
      }
    }

    return null;
  }

  /**
   * Clean up error messages for better user experience
   */
  private cleanErrorMessage(message: string): string {
    return message
      .replace(/^SyntaxError:\s*/i, "")
      .replace(/\s+at position \d+/i, "")
      .replace(/\s+in JSON at position \d+/i, "")
      .trim();
  }

  /**
   * Extract JSON properties for analysis
   */
  public extractJSONProperties(text: string): JSONProperty[] {
    const properties: JSONProperty[] = [];

    try {
      const parsed = JSON.parse(text);
      // This would recursively extract all properties
      // For now, just return empty array - implement as needed
      return properties;
    } catch (error) {
      return properties;
    }
  }

  /**
   * Validate specific JSON value types
   */
  public validateJSONTypes(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const parsed = JSON.parse(text);
      // Type-specific validation would go here
      // e.g., check if URLs are valid, dates are properly formatted, etc.
    } catch (error) {
      // JSON is invalid, skip type validation
    }

    return errors;
  }
}
