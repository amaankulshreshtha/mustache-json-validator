import * as vscode from "vscode";
import { BaseValidator } from "../base/baseValidator";
import { ValidationResult, ValidationError } from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES } from "../../core/constants";

export class JSONSyntaxValidator extends BaseValidator {
  constructor() {
    super("JSONSyntaxValidator", DIAGNOSTIC_SOURCES.JSON);
  }

  /**
   * Main validation method
   */
  public async validate(text: string, document?: vscode.TextDocument): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors = this.validateSync(text);
    const processingTime = Date.now() - startTime;

    return this.createValidationResult(errors, processingTime);
  }

  /**
   * Synchronous validation
   */
  public validateSync(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if text is empty or whitespace only
    if (!text.trim()) {
      return [this.createValidationError("Empty JSON content", 1, 0, "info", undefined, ERROR_CODES.JSON_SYNTAX_ERROR)];
    }

    // Basic JSON parsing validation
    errors.push(...this.validateJSONParsing(text));

    // Structural syntax checks
    errors.push(...this.validateJSONStructure(text));

    // Bracket and brace matching
    errors.push(...this.validateBracketMatching(text));

    // Quote matching
    errors.push(...this.validateQuoteMatching(text));

    return this.sortErrors(errors);
  }

  /**
   * Validate JSON parsing
   */
  private validateJSONParsing(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      JSON.parse(text);
      // If parsing succeeds, no syntax errors
    } catch (error: any) {
      const parseError = this.parseJSONSyntaxError(error, text);
      if (parseError) {
        errors.push(parseError);
      }
    }

    return errors;
  }

  /**
   * Validate JSON structure patterns
   */
  private validateJSONStructure(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Check for common syntax issues
      errors.push(...this.checkLineForSyntaxIssues(line, lineNumber));
    }

    return errors;
  }

  /**
   * Check a single line for syntax issues
   */
  private checkLineForSyntaxIssues(line: string, lineNumber: number): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for unescaped control characters
    const controlCharMatch = line.match(/[\x00-\x1F\x7F]/);
    if (controlCharMatch && controlCharMatch.index !== undefined) {
      errors.push(
        this.createValidationError(
          "Unescaped control character in JSON",
          lineNumber,
          controlCharMatch.index,
          "error",
          1,
          ERROR_CODES.INVALID_ESCAPE
        )
      );
    }

    // Check for invalid escape sequences
    const invalidEscapePattern = /\\[^"\\\/bfnrtu]/g;
    let escapeMatch;
    while ((escapeMatch = invalidEscapePattern.exec(line)) !== null) {
      errors.push(
        this.createValidationError(
          `Invalid escape sequence: ${escapeMatch[0]}`,
          lineNumber,
          escapeMatch.index,
          "error",
          escapeMatch[0].length,
          ERROR_CODES.INVALID_ESCAPE
        )
      );
    }

    // Check for incomplete unicode escapes
    const incompleteUnicodePattern = /\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g;
    let unicodeMatch;
    while ((unicodeMatch = incompleteUnicodePattern.exec(line)) !== null) {
      if (unicodeMatch[0].length < 6) {
        // \uXXXX should be 6 characters
        errors.push(
          this.createValidationError(
            "Incomplete unicode escape sequence",
            lineNumber,
            unicodeMatch.index,
            "error",
            unicodeMatch[0].length,
            ERROR_CODES.INVALID_ESCAPE
          )
        );
      }
    }

    // Check for numbers with leading zeros
    const leadingZeroPattern = /\b0\d+/g;
    let numberMatch;
    while ((numberMatch = leadingZeroPattern.exec(line)) !== null) {
      // Make sure it's not part of a string
      const beforeMatch = line.substring(0, numberMatch.index);
      const insideString = (beforeMatch.split('"').length - 1) % 2 === 1;

      if (!insideString) {
        errors.push(
          this.createValidationError(
            "Numbers cannot have leading zeros in JSON",
            lineNumber,
            numberMatch.index,
            "error",
            numberMatch[0].length,
            ERROR_CODES.JSON_SYNTAX_ERROR
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate bracket and brace matching
   */
  private validateBracketMatching(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const stack: Array<{ char: string; line: number; column: number }> = [];
    const lines = text.split("\n");

    const openChars = { "{": "}", "[": "]" };
    const closeChars = { "}": "{", "]": "[" };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      let insideString = false;
      let escaped = false;

      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];

        // Handle string detection
        if (char === '"' && !escaped) {
          insideString = !insideString;
        }

        // Handle escape sequences
        escaped = char === "\\" && !escaped;

        // Skip characters inside strings
        if (insideString) {
          continue;
        }

        // Check opening brackets/braces
        if (char in openChars) {
          stack.push({ char, line: lineNumber, column: charIndex });
        }

        // Check closing brackets/braces
        if (char in closeChars) {
          const expectedOpen = closeChars[char as keyof typeof closeChars];
          const last = stack.pop();

          if (!last) {
            errors.push(
              this.createValidationError(
                `Unexpected closing ${char === "}" ? "brace" : "bracket"}: '${char}'`,
                lineNumber,
                charIndex,
                "error",
                1,
                ERROR_CODES.JSON_SYNTAX_ERROR
              )
            );
          } else if (last.char !== expectedOpen) {
            errors.push(
              this.createValidationError(
                `Mismatched brackets: expected '${openChars[last.char as keyof typeof openChars]}', found '${char}'`,
                lineNumber,
                charIndex,
                "error",
                1,
                ERROR_CODES.JSON_SYNTAX_ERROR
              )
            );
          }
        }
      }
    }

    // Check for unmatched opening brackets/braces
    for (const unclosed of stack) {
      const expectedClose = openChars[unclosed.char as keyof typeof openChars];
      errors.push(
        this.createValidationError(
          `Unclosed ${unclosed.char === "{" ? "brace" : "bracket"}: '${unclosed.char}' - missing '${expectedClose}'`,
          unclosed.line,
          unclosed.column,
          "error",
          1,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Validate quote matching
   */
  private validateQuoteMatching(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      let escaped = false;
      let quoteStartColumn = -1;

      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];

        if (char === '"' && !escaped) {
          if (quoteStartColumn === -1) {
            // Opening quote
            quoteStartColumn = charIndex;
          } else {
            // Closing quote
            quoteStartColumn = -1;
          }
        }

        // Handle escape sequences
        escaped = char === "\\" && !escaped;
      }

      // Check for unclosed string on this line
      if (quoteStartColumn !== -1) {
        // Only report if this line doesn't continue on next line or is the last line
        const isLastLine = lineIndex === lines.length - 1;
        const nextLine = isLastLine ? "" : lines[lineIndex + 1];
        const continuesOnNextLine = !isLastLine && nextLine.trim().startsWith('"');

        if (isLastLine || !continuesOnNextLine) {
          errors.push(
            this.createValidationError(
              "Unterminated string literal",
              lineNumber,
              quoteStartColumn,
              "error",
              1,
              ERROR_CODES.JSON_SYNTAX_ERROR
            )
          );
        }
      }
    }

    return errors;
  }

  /**
   * Parse JSON syntax error into validation error
   */
  private parseJSONSyntaxError(error: any, text: string): ValidationError | null {
    const message = error.message || error.toString();
    let line = 1;
    let column = 0;

    // Try to extract position information
    const positionMatch = message.match(/position (\d+)/i);
    if (positionMatch) {
      const position = parseInt(positionMatch[1], 10);
      const location = this.getLineColumnFromPosition(text, position);
      line = location.line;
      column = location.column;
    } else {
      // Try other patterns
      const lineMatch = message.match(/line (\d+)/i);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }

      const columnMatch = message.match(/column (\d+)/i);
      if (columnMatch) {
        column = parseInt(columnMatch[1], 10);
      }
    }

    // Clean up the error message
    const cleanMessage = this.cleanErrorMessage(message);

    return this.createValidationError(cleanMessage, line, column, "error", 1, ERROR_CODES.JSON_SYNTAX_ERROR);
  }

  /**
   * Clean error message for better user experience
   */
  private cleanErrorMessage(message: string): string {
    return (
      message
        .replace(/^SyntaxError:\s*/i, "")
        .replace(/\s+at position \d+/i, "")
        .replace(/\s+in JSON at position \d+/i, "")
        .replace(/JSON\.parse:\s*/i, "")
        .trim() || "Invalid JSON syntax"
    );
  }
}
