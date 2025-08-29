import * as vscode from "vscode";
import { BaseValidator } from "../base/baseValidator";
import { ValidationResult, ValidationError, ParsedMustacheTemplate, MustacheSection, SectionType } from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES } from "../../core/constants";

interface SectionStack {
  section: MustacheSection;
  depth: number;
}

export class MustacheSectionValidator extends BaseValidator {
  constructor() {
    super("MustacheSectionValidator", DIAGNOSTIC_SOURCES.MUSTACHE);
  }

  /**
   * Main validation method
   */
  public async validate(text: string, document?: vscode.TextDocument, parsed?: ParsedMustacheTemplate): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors = this.validateSync(text, parsed);
    const processingTime = Date.now() - startTime;

    return this.createValidationResult(errors, processingTime);
  }

  /**
   * Synchronous validation
   */
  public validateSync(text: string, parsed?: ParsedMustacheTemplate): ValidationError[] {
    const errors: ValidationError[] = [];

    // Parse sections if not provided
    const sections = parsed?.sections || this.extractSections(text);

    // Validate section matching
    errors.push(...this.validateSectionMatching(sections));

    // Validate section nesting
    errors.push(...this.validateSectionNesting(sections));

    // Validate section names
    errors.push(...this.validateSectionNames(sections));

    // Validate section logic
    errors.push(...this.validateSectionLogic(sections, text));

    return this.sortErrors(errors);
  }

  /**
   * Validate that sections have matching opening/closing tags
   */
  private validateSectionMatching(sections: MustacheSection[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const sectionStack: SectionStack[] = [];

    for (const section of sections) {
      if (section.type === SectionType.Normal || section.type === SectionType.Inverted) {
        // Opening section - push to stack
        sectionStack.push({
          section,
          depth: sectionStack.length,
        });
      } else if (section.type === SectionType.Closing) {
        // Closing section - check for matching opening
        const lastSection = sectionStack.pop();

        if (!lastSection) {
          // No matching opening section
          errors.push(
            this.createValidationError(
              `Unexpected closing section: {{/${section.name}}} - no matching opening section found`,
              section.startLine,
              section.startColumn,
              "error",
              section.length,
              ERROR_CODES.MISMATCHED_SECTION
            )
          );
        } else if (lastSection.section.name !== section.name) {
          // Mismatched section names
          errors.push(
            this.createValidationError(
              `Mismatched section: expected {{/${lastSection.section.name}}}, found {{/${section.name}}}`,
              section.startLine,
              section.startColumn,
              "error",
              section.length,
              ERROR_CODES.MISMATCHED_SECTION
            )
          );

          // Add related information about the opening section
          errors.push(
            this.createValidationError(
              `Opening section {{#${lastSection.section.name}}} defined here`,
              lastSection.section.startLine,
              lastSection.section.startColumn,
              "info",
              lastSection.section.length,
              ERROR_CODES.MISMATCHED_SECTION
            )
          );
        }
      }
    }

    // Check for unclosed sections
    for (const unclosed of sectionStack) {
      errors.push(
        this.createValidationError(
          `Unclosed section: {{#${unclosed.section.name}}} - missing {{/${unclosed.section.name}}}`,
          unclosed.section.startLine,
          unclosed.section.startColumn,
          "error",
          unclosed.section.length,
          ERROR_CODES.MISMATCHED_SECTION
        )
      );
    }

    return errors;
  }

  /**
   * Validate section nesting depth and structure
   */
  private validateSectionNesting(sections: MustacheSection[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const sectionStack: SectionStack[] = [];
    const maxNestingDepth = 10; // Configurable limit

    for (const section of sections) {
      if (section.type === SectionType.Normal || section.type === SectionType.Inverted) {
        // Check nesting depth
        if (sectionStack.length >= maxNestingDepth) {
          errors.push(
            this.createValidationError(
              `Section nesting too deep (${sectionStack.length + 1} levels) - consider refactoring for better readability`,
              section.startLine,
              section.startColumn,
              "warning",
              section.length,
              ERROR_CODES.NESTED_SECTIONS
            )
          );
        }

        // Check for same-name nesting (but only if they're actually nested, not just inline conditions)
        const sameNameParent = sectionStack.find((s) => s.section.name === section.name);
        if (sameNameParent) {
          // Only warn if they're on different lines (actually nested, not inline)
          if (sameNameParent.section.startLine !== section.startLine) {
            errors.push(
              this.createValidationError(
                `Nested section with same name "${section.name}" may cause confusion`,
                section.startLine,
                section.startColumn,
                "hint", // Changed from warning to hint
                section.length,
                ERROR_CODES.NESTED_SECTIONS
              )
            );
          }
        }

        sectionStack.push({
          section,
          depth: sectionStack.length,
        });
      } else if (section.type === SectionType.Closing) {
        if (sectionStack.length > 0) {
          sectionStack.pop();
        }
      }
    }

    return errors;
  }

  /**
   * Validate section names follow conventions
   */
  private validateSectionNames(sections: MustacheSection[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const section of sections) {
      // Skip closing sections (already validated in matching)
      if (section.type === SectionType.Closing) {
        continue;
      }

      // Check for empty names (should be caught by syntax validator, but double-check)
      if (!section.name || section.name.trim().length === 0) {
        errors.push(
          this.createValidationError(
            "Section name cannot be empty",
            section.startLine,
            section.startColumn,
            "error",
            section.length,
            ERROR_CODES.INVALID_TAG_NAME
          )
        );
        continue;
      }

      // Check naming conventions
      const name = section.name.trim();

      // Check for invalid starting characters
      if (!/^[a-zA-Z_]/.test(name)) {
        errors.push(
          this.createValidationError(
            "Section names should start with a letter or underscore",
            section.startLine,
            section.startColumn,
            "warning",
            section.length,
            ERROR_CODES.INVALID_TAG_NAME
          )
        );
      }

      // Check for reserved words or common mistakes
      const reservedWords = ["if", "else", "for", "while", "function", "var", "let", "const"];
      if (reservedWords.includes(name.toLowerCase())) {
        errors.push(
          this.createValidationError(
            `"${name}" is a reserved word in many languages - consider using a different section name`,
            section.startLine,
            section.startColumn,
            "hint",
            section.length,
            ERROR_CODES.INVALID_TAG_NAME
          )
        );
      }

      // Check for overly long names
      if (name.length > 50) {
        errors.push(
          this.createValidationError(
            "Section name is very long - consider using a shorter, more descriptive name",
            section.startLine,
            section.startColumn,
            "hint",
            section.length,
            ERROR_CODES.INVALID_TAG_NAME
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate section logic and common patterns
   */
  private validateSectionLogic(sections: MustacheSection[], text: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = text.split("\n");

    // Group sections by their relationships
    const sectionPairs = this.groupSectionPairs(sections);

    for (const pair of sectionPairs) {
      if (!pair.closing) {
        continue; // Already handled in matching validation
      }

      // Extract content between opening and closing sections
      const content = this.extractSectionContent(
        lines,
        pair.opening.startLine,
        pair.opening.startColumn + pair.opening.length,
        pair.closing.startLine,
        pair.closing.startColumn
      );

      // Validate section content
      errors.push(...this.validateSectionContent(pair, content));
    }

    return errors;
  }

  /**
   * Group sections into opening/closing pairs
   */
  private groupSectionPairs(sections: MustacheSection[]): Array<{ opening: MustacheSection; closing?: MustacheSection }> {
    const pairs: Array<{ opening: MustacheSection; closing?: MustacheSection }> = [];
    const sectionStack: MustacheSection[] = [];

    for (const section of sections) {
      if (section.type === SectionType.Normal || section.type === SectionType.Inverted) {
        sectionStack.push(section);
      } else if (section.type === SectionType.Closing) {
        // Find matching opening section
        for (let i = sectionStack.length - 1; i >= 0; i--) {
          if (sectionStack[i].name === section.name) {
            const opening = sectionStack.splice(i, 1)[0];
            pairs.push({ opening, closing: section });
            break;
          }
        }
      }
    }

    // Add unclosed sections
    for (const unclosed of sectionStack) {
      pairs.push({ opening: unclosed });
    }

    return pairs;
  }

  /**
   * Extract content between section tags
   */
  private extractSectionContent(lines: string[], startLine: number, startColumn: number, endLine: number, endColumn: number): string {
    if (startLine === endLine) {
      return lines[startLine - 1]?.substring(startColumn, endColumn) || "";
    }

    let content = "";

    for (let i = startLine - 1; i <= endLine - 1 && i < lines.length; i++) {
      if (i === startLine - 1) {
        // First line - take from startColumn to end
        content += lines[i].substring(startColumn) + "\n";
      } else if (i === endLine - 1) {
        // Last line - take from start to endColumn
        content += lines[i].substring(0, endColumn);
      } else {
        // Middle lines - take entire line
        content += lines[i] + "\n";
      }
    }

    return content;
  }

  /**
   * Validate content within a section
   */
  private validateSectionContent(pair: { opening: MustacheSection; closing?: MustacheSection }, content: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!content.trim()) {
      // Empty section content
      if (pair.opening.type === SectionType.Normal) {
        errors.push(
          this.createValidationError(
            `Empty section content for "{{#${pair.opening.name}}}" - consider removing if not needed`,
            pair.opening.startLine,
            pair.opening.startColumn,
            "hint",
            pair.opening.length,
            ERROR_CODES.MUSTACHE_SYNTAX_ERROR
          )
        );
      }
    }

    // Check for common anti-patterns
    errors.push(...this.checkSectionAntiPatterns(pair, content));

    return errors;
  }

  /**
   * Check for section anti-patterns
   */
  private checkSectionAntiPatterns(pair: { opening: MustacheSection; closing?: MustacheSection }, content: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Anti-pattern: Section with only whitespace or comments
    const contentWithoutComments = content.replace(/\{\{!.*?\}\}/g, "").trim();
    if (!contentWithoutComments && content.trim()) {
      errors.push(
        this.createValidationError(
          `Section "{{#${pair.opening.name}}}" contains only comments or whitespace`,
          pair.opening.startLine,
          pair.opening.startColumn,
          "hint",
          pair.opening.length,
          ERROR_CODES.MUSTACHE_SYNTAX_ERROR
        )
      );
    }

    // Anti-pattern: Immediately nested same-type section
    const immediateNestedPattern = new RegExp(`^\\s*\\{\\{[#^]\\s*${pair.opening.name}\\s*\\}\\}`);
    if (immediateNestedPattern.test(content)) {
      errors.push(
        this.createValidationError(
          `Immediately nested section with same name "${pair.opening.name}" may be redundant`,
          pair.opening.startLine,
          pair.opening.startColumn,
          "warning",
          pair.opening.length,
          ERROR_CODES.NESTED_SECTIONS
        )
      );
    }

    return errors;
  }

  /**
   * Extract sections from text (fallback if not provided)
   */
  private extractSections(text: string): MustacheSection[] {
    const sections: MustacheSection[] = [];
    const lines = text.split("\n");

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Opening sections: {{#name}}
      let match;
      const openingPattern = /\{\{\s*#\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g;
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
      const invertedPattern = /\{\{\s*\^\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g;
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
      const closingPattern = /\{\{\s*\/\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g;
      while ((match = closingPattern.exec(line)) !== null) {
        sections.push({
          name: match[1],
          type: SectionType.Closing,
          startLine: lineNumber,
          startColumn: match.index,
          length: match[0].length,
        });
      }
    }

    return sections;
  }
}
