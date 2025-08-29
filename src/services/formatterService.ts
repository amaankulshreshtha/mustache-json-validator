import * as vscode from "vscode";

export interface FormatterOptions {
  indentSize: number;
  insertFinalNewline: boolean;
  trimTrailingWhitespace: boolean;
  insertSpacesAroundMustacheTags: boolean;
}

export class FormatterService {
  private options: FormatterOptions;

  constructor(options?: Partial<FormatterOptions>) {
    this.options = {
      indentSize: 2,
      insertFinalNewline: true,
      trimTrailingWhitespace: true,
      insertSpacesAroundMustacheTags: false,
      ...options,
    };
  }

  /**
   * Format Mustache JSON template with proper indentation
   */
  public formatDocument(text: string, options?: Partial<FormatterOptions>): string {
    const formatOptions = { ...this.options, ...options };

    try {
      // First, parse the structure while preserving Mustache tags
      const formatted = this.formatMustacheJSON(text, formatOptions);

      return this.applyFinalFormatting(formatted, formatOptions);
    } catch (error) {
      // If formatting fails, return original text
      console.error("Formatting failed:", error);
      return text;
    }
  }

  /**
   * Format Mustache JSON with proper structure
   */
  private formatMustacheJSON(text: string, options: FormatterOptions): string {
    let result = "";
    let indentLevel = 0;
    let inString = false;
    let inMustacheTag = false;
    let i = 0;

    const indent = " ".repeat(options.indentSize);
    const lines = text.split("\n");

    // Process line by line for better control
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const formattedLine = this.formatLine(trimmedLine, indentLevel, options);

      // Adjust indent level based on line content
      const indentChange = this.calculateIndentChange(trimmedLine);

      // Apply indent before adding line (for closing brackets)
      if (indentChange < 0) {
        indentLevel += indentChange;
      }

      // Add the formatted line with proper indentation
      result += indent.repeat(Math.max(0, indentLevel)) + formattedLine + "\n";

      // Apply indent after adding line (for opening brackets)
      if (indentChange > 0) {
        indentLevel += indentChange;
      }
    }

    return result;
  }

  /**
   * Format a single line with Mustache awareness
   */
  private formatLine(line: string, indentLevel: number, options: FormatterOptions): string {
    let result = "";
    let inString = false;
    let inMustacheTag = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      const prevChar = i > 0 ? line[i - 1] : "";

      // Handle string detection
      if (char === '"' && prevChar !== "\\") {
        inString = !inString;
        result += char;
        i++;
        continue;
      }

      // Skip processing inside strings
      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Handle Mustache tag detection
      if (char === "{" && nextChar === "{") {
        inMustacheTag = true;
        if (options.insertSpacesAroundMustacheTags && result.slice(-1) !== " " && result.length > 0) {
          result += " ";
        }
        result += "{{";
        i += 2;
        continue;
      }

      if (char === "}" && nextChar === "}" && inMustacheTag) {
        inMustacheTag = false;
        result += "}}";
        if (options.insertSpacesAroundMustacheTags && line[i + 2] && line[i + 2] !== " " && line[i + 2] !== "," && line[i + 2] !== "}") {
          result += " ";
        }
        i += 2;
        continue;
      }

      // Handle JSON formatting
      if (!inMustacheTag) {
        switch (char) {
          case ",":
            result += ",";
            // Add space after comma if not followed by newline or Mustache tag
            if (nextChar && nextChar !== "\n" && nextChar !== " " && !(nextChar === "{" && line[i + 2] === "{")) {
              result += " ";
            }
            break;

          case ":":
            result += ":";
            // Add space after colon
            if (nextChar && nextChar !== " ") {
              result += " ";
            }
            break;

          case " ":
            // Collapse multiple spaces (except in strings or Mustache tags)
            if (prevChar !== " ") {
              result += " ";
            }
            break;

          default:
            result += char;
        }
      } else {
        // Inside Mustache tag - preserve spacing
        result += char;
      }

      i++;
    }

    return result.trim();
  }

  /**
   * Calculate indent level change based on line content
   */
  private calculateIndentChange(line: string): number {
    let change = 0;
    let inString = false;
    let inMustacheTag = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      const prevChar = i > 0 ? line[i - 1] : "";

      // Handle string detection
      if (char === '"' && prevChar !== "\\") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      // Handle Mustache tags
      if (char === "{" && nextChar === "{") {
        inMustacheTag = true;
        i++; // Skip next character
        continue;
      }

      if (char === "}" && nextChar === "}" && inMustacheTag) {
        inMustacheTag = false;
        i++; // Skip next character
        continue;
      }

      if (inMustacheTag) {
        continue;
      }

      // JSON structure characters
      switch (char) {
        case "{":
        case "[":
          change++;
          break;
        case "}":
        case "]":
          change--;
          break;
      }
    }

    return change;
  }

  /**
   * Apply final formatting rules
   */
  private applyFinalFormatting(text: string, options: FormatterOptions): string {
    let result = text;

    // Trim trailing whitespace
    if (options.trimTrailingWhitespace) {
      result = result
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
    }

    // Insert final newline
    if (options.insertFinalNewline && !result.endsWith("\n")) {
      result += "\n";
    }

    // Remove extra blank lines
    result = result.replace(/\n{3,}/g, "\n\n");

    return result;
  }

  /**
   * Format Mustache sections with proper indentation
   */
  public formatMustacheSections(text: string): string {
    const lines = text.split("\n");
    const result: string[] = [];
    const indent = " ".repeat(this.options.indentSize);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        result.push("");
        continue;
      }

      // Handle Mustache section indentation
      if (this.isMustacheSection(trimmed)) {
        const formatted = this.formatMustacheSectionLine(trimmed);
        result.push(formatted);
      } else {
        result.push(trimmed);
      }
    }

    return result.join("\n");
  }

  /**
   * Check if line contains Mustache section
   */
  private isMustacheSection(line: string): boolean {
    return /\{\{\s*[#^/]\s*\w+\s*\}\}/.test(line);
  }

  /**
   * Format Mustache section line
   */
  private formatMustacheSectionLine(line: string): string {
    // Format section tags: {{#section}} {{/section}} {{^section}}
    return line.replace(/\{\{\s*([#^/])\s*(\w+)\s*\}\}/g, "{{$1$2}}").replace(/\{\{\s*([#^/])\s*(\w+)\s*\}\}/g, (match, operator, name) => {
      return this.options.insertSpacesAroundMustacheTags ? `{{ ${operator}${name} }}` : `{{${operator}${name}}}`;
    });
  }

  /**
   * Get formatting options from VSCode settings
   */
  public static getFormattingOptions(): FormatterOptions {
    const config = vscode.workspace.getConfiguration();
    const editorConfig = vscode.workspace.getConfiguration("editor");

    return {
      indentSize: editorConfig.get("tabSize", 2),
      insertFinalNewline: editorConfig.get("insertFinalNewline", true),
      trimTrailingWhitespace: editorConfig.get("trimAutoWhitespace", true),
      insertSpacesAroundMustacheTags: config.get("mustacheJsonValidator.formatter.spacesAroundTags", false),
    };
  }
}
