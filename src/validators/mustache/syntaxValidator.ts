import * as vscode from "vscode";
import { BaseValidator } from "../base/baseValidator";
import { ValidationResult, ValidationError } from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES, MUSTACHE_PATTERNS } from "../../core/constants";

export class MustacheSyntaxValidator extends BaseValidator {
  constructor() {
    super("MustacheSyntaxValidator", DIAGNOSTIC_SOURCES.MUSTACHE);
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

    // Check for unclosed tags
    errors.push(...this.checkUnclosedTags(text));

    // Check for malformed tags
    errors.push(...this.checkMalformedTags(text));

    // Check for invalid tag names
    errors.push(...this.checkInvalidTagNames(text));

    // Check for nested tags
    errors.push(...this.checkNestedTags(text));

    // Check for unbalanced braces
    errors.push(...this.checkUnbalancedBraces(text));

    return this.sortErrors(errors);
  }

  /**
   * Check for unclosed Mustache tags
   */
  private checkUnclosedTags(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find opening braces without closing braces
      let match;
      while ((match = MUSTACHE_PATTERNS.UNCLOSED_TAG.exec(line)) !== null) {
        errors.push(
          this.createValidationError(
            'Unclosed Mustache tag - missing closing "}}"',
            lineNumber,
            match.index,
            "error",
            2, // Length of "{{"
            ERROR_CODES.UNCLOSED_TAG
          )
        );
      }

      // Reset regex lastIndex for next iteration
      MUSTACHE_PATTERNS.UNCLOSED_TAG.lastIndex = 0;
    }

    return errors;
  }

  /**
   * Check for malformed Mustache tags
   */
  private checkMalformedTags(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for single braces that are NOT part of double braces
      this.checkSingleBraces(line, lineNumber, errors);

      // Find other malformed patterns
      const malformedPatterns = [
        // More than three opening braces
        { regex: /\{{4,}/g, message: "Too many opening braces - use {{ or {{{" },
        // More than three closing braces
        { regex: /\}{4,}/g, message: "Too many closing braces - use }} or }}}" },
        // Mixed brace counts
        { regex: /\{\{\{[^}]*\}\}/g, message: "Mismatched braces - triple braces need triple closing: {{{...}}}" },
        { regex: /\{\{[^}]*\}\}\}/g, message: "Mismatched braces - double braces need double closing: {{...}}" },
        // Empty tags
        { regex: /\{\{\s*\}\}/g, message: "Empty Mustache tag" },
      ];

      for (const pattern of malformedPatterns) {
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          errors.push(
            this.createValidationError(
              pattern.message,
              lineNumber,
              match.index,
              "error",
              match[0].length,
              ERROR_CODES.MUSTACHE_SYNTAX_ERROR
            )
          );
        }
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
      }
    }

    return errors;
  }

  /**
   * Check for single braces that should be double braces
   */
  private checkSingleBraces(line: string, lineNumber: number, errors: ValidationError[]): void {
    // Look for single braces that are not part of double braces
    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === "{") {
        // Check if this is NOT part of {{ (double opening)
        if (line[i + 1] !== "{") {
          // Find the closing brace
          const closingIndex = line.indexOf("}", i);
          if (closingIndex !== -1 && line[closingIndex + 1] !== "}") {
            // This is a single brace pair like {something}
            const content = line.substring(i, closingIndex + 1);
            errors.push(
              this.createValidationError(
                "Single braces should be double braces: {{...}}",
                lineNumber,
                i,
                "error",
                content.length,
                ERROR_CODES.MUSTACHE_SYNTAX_ERROR
              )
            );
          }
        }
      }
    }
  }

  /**
   * Check for invalid tag names
   */
  private checkInvalidTagNames(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find tags with invalid characters
      const invalidPatterns = [
        // Section tags without names
        { regex: /\{\{\s*[#^/]\s*\}\}/g, message: "Section tag missing name" },
        // Tags starting with numbers or invalid characters
        { regex: /\{\{\s*[#^/]?\s*[0-9][^}]*\}\}/g, message: "Tag names cannot start with numbers" },
        // Tags with special characters (except dots and dashes)
        {
          regex: /\{\{\s*[#^/&]?\s*[a-zA-Z_][^}\s]*[^\w.\-][^}]*\}\}/g,
          message: "Invalid characters in tag name - use only letters, numbers, dots, underscores, and dashes",
        },
        // Whitespace in tag names (not around)
        { regex: /\{\{\s*[#^/&]?\s*[a-zA-Z_][^}]*\s+[^}]*\}\}/g, message: "Tag names cannot contain whitespace" },
      ];

      for (const pattern of invalidPatterns) {
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          // Skip if it's a comment (starts with !)
          if (match[0].includes("{{!") || match[0].includes("{{ !")) {
            continue;
          }

          errors.push(
            this.createValidationError(pattern.message, lineNumber, match.index, "error", match[0].length, ERROR_CODES.INVALID_TAG_NAME)
          );
        }
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
      }
    }

    return errors;
  }

  /**
   * Check for nested Mustache tags (not allowed)
   */
  private checkNestedTags(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Look for {{ inside another tag
      const nestedPattern = /\{\{[^}]*\{\{/g;
      let match;
      while ((match = nestedPattern.exec(line)) !== null) {
        errors.push(
          this.createValidationError(
            "Nested Mustache tags are not allowed",
            lineNumber,
            match.index,
            "error",
            match[0].length,
            ERROR_CODES.NESTED_SECTIONS
          )
        );
      }

      // Reset regex lastIndex
      nestedPattern.lastIndex = 0;
    }

    return errors;
  }

  /**
   * Check for unbalanced braces in the entire text
   */
  private checkUnbalancedBraces(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Count opening and closing brace pairs
    const openingBraces = (text.match(/\{\{/g) || []).length;
    const closingBraces = (text.match(/\}\}/g) || []).length;

    if (openingBraces !== closingBraces) {
      const difference = Math.abs(openingBraces - closingBraces);
      const missingType = openingBraces > closingBraces ? "closing" : "opening";

      errors.push(
        this.createValidationError(
          `Unbalanced braces: ${difference} ${missingType} brace${difference > 1 ? "s" : ""} missing`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.MUSTACHE_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Validate specific Mustache syntax rules
   */
  public validateMustacheRules(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for common mistakes
    errors.push(...this.checkCommonMistakes(text));

    // Check for best practices
    errors.push(...this.checkBestPractices(text));

    return errors;
  }

  /**
   * Check for common Mustache mistakes
   */
  private checkCommonMistakes(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Common mistakes patterns
      const mistakes = [
        // Using == or != (not valid in Mustache)
        { regex: /\{\{[^}]*[=!]=.*?\}\}/g, message: "Mustache does not support comparison operators - use sections instead" },
        // Using && or || (not valid in Mustache)
        { regex: /\{\{[^}]*[&|]{2}.*?\}\}/g, message: "Mustache does not support logical operators - use nested sections instead" },
        // Trying to use if/else syntax
        { regex: /\{\{\s*if\s+.*?\}\}/gi, message: "Use {{#condition}} instead of {{if condition}}" },
        { regex: /\{\{\s*else\s*\}\}/gi, message: "Use {{^condition}} for else logic in Mustache" },
        // HTML/XML style tags
        { regex: /<mustache[^>]*>/gi, message: "Use {{ }} syntax, not HTML-style tags" },
      ];

      for (const mistake of mistakes) {
        let match;
        while ((match = mistake.regex.exec(line)) !== null) {
          errors.push(
            this.createValidationError(
              mistake.message,
              lineNumber,
              match.index,
              "warning",
              match[0].length,
              ERROR_CODES.MUSTACHE_SYNTAX_ERROR
            )
          );
        }
        // Reset regex lastIndex
        mistake.regex.lastIndex = 0;
      }
    }

    return errors;
  }

  /**
   * Check for Mustache best practices
   */
  private checkBestPractices(text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Best practices checks
      const practices = [
        // Excessive whitespace in tags
        { regex: /\{\{\s{3,}[^}]*\s{3,}\}\}/g, message: "Consider reducing whitespace in Mustache tags for better readability" },
        // Very long variable names (over 50 chars)
        {
          regex: /\{\{\s*[#^/&]?\s*[a-zA-Z_][a-zA-Z0-9_.\-]{50,}\s*\}\}/g,
          message: "Consider using shorter, more descriptive variable names",
        },
      ];

      for (const practice of practices) {
        let match;
        while ((match = practice.regex.exec(line)) !== null) {
          errors.push(
            this.createValidationError(
              practice.message,
              lineNumber,
              match.index,
              "hint",
              match[0].length,
              ERROR_CODES.MUSTACHE_SYNTAX_ERROR
            )
          );
        }
        // Reset regex lastIndex
        practice.regex.lastIndex = 0;
      }
    }

    return errors;
  }
}
