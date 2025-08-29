import * as vscode from "vscode";
import * as Mustache from "mustache";
import { BaseValidator } from "../base/baseValidator";
import { MustacheSyntaxValidator } from "./syntaxValidator";
import { MustacheSectionValidator } from "./sectionValidator";
import {
  ValidationResult,
  ValidationError,
  ParsedMustacheTemplate,
  MustacheSection,
  MustacheVariable,
  MustacheComment,
  SectionType,
} from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES, MUSTACHE_PATTERNS } from "../../core/constants";

export class MustacheValidator extends BaseValidator {
  private syntaxValidator: MustacheSyntaxValidator;
  private sectionValidator: MustacheSectionValidator;

  constructor() {
    super("MustacheValidator", DIAGNOSTIC_SOURCES.MUSTACHE);
    this.syntaxValidator = new MustacheSyntaxValidator();
    this.sectionValidator = new MustacheSectionValidator();
  }

  /**
   * Main validation method
   */
  public async validate(text: string, document?: vscode.TextDocument): Promise<ValidationResult> {
    if (!this.isFileSizeAcceptable(text)) {
      return this.createValidationResult([
        this.createValidationError("File too large for validation", 1, 0, "warning", undefined, ERROR_CODES.MUSTACHE_SYNTAX_ERROR),
      ]);
    }

    const startTime = Date.now();
    const errors: ValidationError[] = [];

    try {
      // Parse the Mustache template
      const parsed = this.parseTemplate(text);
      errors.push(...parsed.errors);

      // Validate syntax
      const syntaxErrors = await this.syntaxValidator.validate(text, document);
      errors.push(...syntaxErrors.errors);

      // Validate sections/conditionals
      const sectionErrors = await this.sectionValidator.validate(text, document, parsed);
      errors.push(...sectionErrors.errors);

      // Validate template compilation
      const compilationErrors = this.validateCompilation(text);
      errors.push(...compilationErrors);

      const processingTime = Date.now() - startTime;
      return this.createValidationResult(this.sortErrors(errors), processingTime);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      return this.createValidationResult(
        [
          this.createValidationError(
            `Mustache validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            1,
            0,
            "error",
            undefined,
            ERROR_CODES.MUSTACHE_SYNTAX_ERROR
          ),
        ],
        processingTime
      );
    }
  }

  /**
   * Quick synchronous validation
   */
  public validateSync(text: string): ValidationError[] {
    try {
      const parsed = this.parseTemplate(text);
      const syntaxErrors = this.syntaxValidator.validateSync(text);
      const compilationErrors = this.validateCompilation(text);

      return this.sortErrors([...parsed.errors, ...syntaxErrors, ...compilationErrors]);
    } catch (error) {
      return [
        this.createValidationError(
          `Mustache validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.MUSTACHE_SYNTAX_ERROR
        ),
      ];
    }
  }

  /**
   * Parse Mustache template and extract components
   */
  public parseTemplate(text: string): ParsedMustacheTemplate {
    const errors: ValidationError[] = [];
    const sections: MustacheSection[] = [];
    const variables: MustacheVariable[] = [];
    const comments: MustacheComment[] = [];

    const lines = text.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Extract sections
      sections.push(...this.extractSections(line, lineNumber));

      // Extract variables
      variables.push(...this.extractVariables(line, lineNumber));

      // Extract comments
      comments.push(...this.extractComments(line, lineNumber));
    }

    return {
      sections,
      variables,
      comments,
      errors,
    };
  }

  /**
   * Validate that template can be compiled by Mustache
   */
  private validateCompilation(text: string): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      // Try to parse the template
      const parsed = Mustache.parse(text);

      // Check for parsing warnings/issues
      if (parsed && Array.isArray(parsed)) {
        for (const token of parsed) {
          if (Array.isArray(token) && token.length >= 4) {
            const [type, name, start, end] = token;

            // Check for potential issues
            if (type === "name" && !name.trim()) {
              const location = this.getLineColumnFromPosition(text, start);
              errors.push(
                this.createValidationError(
                  "Empty variable name",
                  location.line,
                  location.column,
                  "error",
                  end - start,
                  ERROR_CODES.INVALID_TAG_NAME
                )
              );
            }
          }
        }
      }
    } catch (error) {
      // Parse Mustache compilation error
      const errorInfo = this.parseMustacheCompilationError(error, text);
      if (errorInfo) {
        errors.push(errorInfo);
      }
    }

    return errors;
  }

  /**
   * Extract section blocks from a line
   */
  private extractSections(line: string, lineNumber: number): MustacheSection[] {
    const sections: MustacheSection[] = [];

    // Opening sections: {{#name}}
    let match;
    const openingPattern = new RegExp(MUSTACHE_PATTERNS.SECTION_START.source, "g");
    while ((match = openingPattern.exec(line)) !== null) {
      sections.push({
        name: match[1],
        type: SectionType.Normal,
        startLine: lineNumber,
        startColumn: match.index,
        length: match[0].length,
      });
    }

    // Inverted sections: {{^name}}
    const invertedPattern = new RegExp(MUSTACHE_PATTERNS.INVERTED_SECTION.source, "g");
    while ((match = invertedPattern.exec(line)) !== null) {
      sections.push({
        name: match[1],
        type: SectionType.Inverted,
        startLine: lineNumber,
        startColumn: match.index,
        length: match[0].length,
      });
    }

    // Closing sections: {{/name}}
    const closingPattern = new RegExp(MUSTACHE_PATTERNS.SECTION_END.source, "g");
    while ((match = closingPattern.exec(line)) !== null) {
      sections.push({
        name: match[1],
        type: SectionType.Closing,
        startLine: lineNumber,
        startColumn: match.index,
        length: match[0].length,
      });
    }

    return sections;
  }

  /**
   * Extract variables from a line
   */
  private extractVariables(line: string, lineNumber: number): MustacheVariable[] {
    const variables: MustacheVariable[] = [];

    // Regular variables: {{variable}}
    let match;
    const variablePattern = new RegExp(MUSTACHE_PATTERNS.VARIABLE.source, "g");
    while ((match = variablePattern.exec(line)) !== null) {
      variables.push({
        name: match[1],
        line: lineNumber,
        column: match.index,
        length: match[0].length,
        isEscaped: true,
        isTripleBrace: false,
      });
    }

    // Unescaped variables: {{{variable}}}
    const triplePattern = new RegExp(MUSTACHE_PATTERNS.UNESCAPED_TRIPLE.source, "g");
    while ((match = triplePattern.exec(line)) !== null) {
      variables.push({
        name: match[1],
        line: lineNumber,
        column: match.index,
        length: match[0].length,
        isEscaped: false,
        isTripleBrace: true,
      });
    }

    // Unescaped variables: {{&variable}}
    const ampersandPattern = new RegExp(MUSTACHE_PATTERNS.UNESCAPED_AMPERSAND.source, "g");
    while ((match = ampersandPattern.exec(line)) !== null) {
      variables.push({
        name: match[1],
        line: lineNumber,
        column: match.index,
        length: match[0].length,
        isEscaped: false,
        isTripleBrace: false,
      });
    }

    return variables;
  }

  /**
   * Extract comments from a line
   */
  private extractComments(line: string, lineNumber: number): MustacheComment[] {
    const comments: MustacheComment[] = [];

    let match;
    const commentPattern = new RegExp(MUSTACHE_PATTERNS.COMMENT.source, "g");
    while ((match = commentPattern.exec(line)) !== null) {
      comments.push({
        content: match[1],
        line: lineNumber,
        column: match.index,
        length: match[0].length,
      });
    }

    return comments;
  }

  /**
   * Parse Mustache compilation error
   */
  private parseMustacheCompilationError(error: any, text: string): ValidationError | null {
    const message = error.message || error.toString();

    // Try to extract line/column from error message
    let line = 1;
    let column = 0;

    // Look for position information in error
    const lineMatch = message.match(/line (\d+)/i);
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
    }

    const columnMatch = message.match(/column (\d+)/i);
    if (columnMatch) {
      column = parseInt(columnMatch[1], 10);
    }

    // If no position info found, try to locate the error
    if (line === 1 && column === 0) {
      const location = this.findErrorLocationInText(text, message);
      if (location) {
        line = location.line;
        column = location.column;
      }
    }

    return this.createValidationError(
      `Template compilation error: ${message}`,
      line,
      column,
      "error",
      undefined,
      ERROR_CODES.TEMPLATE_COMPILE_ERROR
    );
  }

  /**
   * Find approximate error location in text based on error message
   */
  private findErrorLocationInText(text: string, errorMessage: string): { line: number; column: number } | null {
    const lines = text.split("\n");

    // Look for common error patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for unclosed tags
      if (errorMessage.includes("unclosed") || errorMessage.includes("Unclosed")) {
        const unclonedMatch = line.match(MUSTACHE_PATTERNS.UNCLOSED_TAG);
        if (unclonedMatch) {
          return { line: i + 1, column: unclonedMatch.index || 0 };
        }
      }

      // Check for invalid syntax
      if (errorMessage.includes("invalid") || errorMessage.includes("Invalid")) {
        const invalidMatch = line.match(/\{\{[^}]*$/);
        if (invalidMatch) {
          return { line: i + 1, column: invalidMatch.index || 0 };
        }
      }
    }

    return null;
  }
}
