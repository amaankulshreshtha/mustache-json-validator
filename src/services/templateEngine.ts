import * as vscode from "vscode";
import * as Mustache from "mustache";
import { TemplateContext, RenderOptions, RenderResult } from "../core/types";
import { ConfigurationManager } from "../core/config";

export class TemplateEngine {
  private configManager: ConfigurationManager;
  private renderCache = new Map<string, { result: RenderResult; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.configManager = ConfigurationManager.getInstance();

    // Clear cache periodically
    setInterval(() => {
      this.cleanupCache();
    }, 60 * 1000); // Every minute
  }

  /**
   * Render Mustache template with context
   */
  public async renderTemplate(template: string, context?: TemplateContext, options?: RenderOptions): Promise<RenderResult> {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(template, context, options);

      // Check cache first
      const cached = this.renderCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.result;
      }

      // Get context from config if not provided
      const renderContext = context || (await this.getDefaultContext());

      // Parse template to extract variables and sections
      const parsed = Mustache.parse(template);
      const extractedVars = this.extractVariables(parsed);
      const extractedSections = this.extractSections(parsed);

      // Render the template
      const output = Mustache.render(template, renderContext, options?.partials);

      const result: RenderResult = {
        output,
        success: true,
        variables: extractedVars,
        sections: extractedSections,
      };

      // Cache the result
      this.renderCache.set(cacheKey, { result, timestamp: Date.now() });

      return result;
    } catch (error) {
      return {
        output: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown rendering error",
        variables: [],
        sections: [],
      };
    }
  }

  /**
   * Render template synchronously (without context loading)
   */
  public renderTemplateSync(template: string, context: TemplateContext = {}, options?: RenderOptions): RenderResult {
    try {
      // Parse template
      const parsed = Mustache.parse(template);
      const extractedVars = this.extractVariables(parsed);
      const extractedSections = this.extractSections(parsed);

      // Render
      const output = Mustache.render(template, context, options?.partials);

      return {
        output,
        success: true,
        variables: extractedVars,
        sections: extractedSections,
      };
    } catch (error) {
      return {
        output: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown rendering error",
        variables: [],
        sections: [],
      };
    }
  }

  /**
   * Validate template syntax without rendering
   */
  public validateTemplate(template: string): { isValid: boolean; error?: string } {
    try {
      Mustache.parse(template);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Template parsing failed",
      };
    }
  }

  /**
   * Extract variables from parsed template
   */
  private extractVariables(parsed: any[]): string[] {
    const variables = new Set<string>();

    const extractFromTokens = (tokens: any[]) => {
      for (const token of tokens) {
        if (Array.isArray(token)) {
          const [type, name] = token;

          switch (type) {
            case "name":
            case "&":
            case "{":
              if (name) {
                variables.add(name);
              }
              break;
            case "#":
            case "^":
              if (name) {
                variables.add(name);
              }
              // Process nested tokens
              if (token[4] && Array.isArray(token[4])) {
                extractFromTokens(token[4]);
              }
              break;
          }
        }
      }
    };

    extractFromTokens(parsed);
    return Array.from(variables);
  }

  /**
   * Extract sections from parsed template
   */
  private extractSections(parsed: any[]): string[] {
    const sections = new Set<string>();

    const extractFromTokens = (tokens: any[]) => {
      for (const token of tokens) {
        if (Array.isArray(token)) {
          const [type, name] = token;

          if ((type === "#" || type === "^") && name) {
            sections.add(name);
            // Process nested tokens
            if (token[4] && Array.isArray(token[4])) {
              extractFromTokens(token[4]);
            }
          }
        }
      }
    };

    extractFromTokens(parsed);
    return Array.from(sections);
  }

  /**
   * Get default context from configuration
   */
  private async getDefaultContext(): Promise<TemplateContext> {
    const contextInfo = await this.configManager.getContextFileInfo();

    if (contextInfo && contextInfo.isValid && contextInfo.content) {
      return contextInfo.content;
    }

    return {};
  }

  /**
   * Generate cache key for template rendering
   */
  private generateCacheKey(template: string, context?: TemplateContext, options?: RenderOptions): string {
    const contextStr = JSON.stringify(context || {});
    const optionsStr = JSON.stringify(options || {});
    return `${template.length}:${this.hashString(template + contextStr + optionsStr)}`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.renderCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        this.renderCache.delete(key);
      }
    }
  }

  /**
   * Clear render cache
   */
  public clearCache(): void {
    this.renderCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.renderCache.size,
      // Hit rate calculation would require tracking hits/misses
    };
  }

  /**
   * Preview template with sample data
   */
  public async previewTemplate(template: string): Promise<RenderResult> {
    // Extract variables from template
    const parsed = Mustache.parse(template);
    const variables = this.extractVariables(parsed);
    const sections = this.extractSections(parsed);

    // Generate sample context
    const sampleContext = this.generateSampleContext(variables, sections);

    return this.renderTemplate(template, sampleContext);
  }

  /**
   * Generate sample context for preview
   */
  private generateSampleContext(variables: string[], sections: string[]): TemplateContext {
    const context: TemplateContext = {};

    // Generate sample values for variables
    for (const variable of variables) {
      if (variable.includes(".")) {
        // Handle nested properties
        this.setNestedProperty(context, variable, this.generateSampleValue(variable));
      } else {
        context[variable] = this.generateSampleValue(variable);
      }
    }

    // Generate sample values for sections
    for (const section of sections) {
      if (!context[section]) {
        if (section.endsWith("s") || section.includes("list") || section.includes("items")) {
          // Assume it's an array
          context[section] = [
            { name: "Sample Item 1", value: "Value 1" },
            { name: "Sample Item 2", value: "Value 2" },
          ];
        } else {
          // Assume it's a boolean or object
          context[section] = true;
        }
      }
    }

    return context;
  }

  /**
   * Generate sample value based on variable name
   */
  private generateSampleValue(variableName: string): any {
    const lowerName = variableName.toLowerCase();

    if (lowerName.includes("name")) {
      return "Sample Name";
    }
    if (lowerName.includes("email")) {
      return "sample@example.com";
    }
    if (lowerName.includes("id")) {
      return 123;
    }
    if (lowerName.includes("count") || lowerName.includes("number")) {
      return 42;
    }
    if (lowerName.includes("date")) {
      return new Date().toISOString();
    }
    if (lowerName.includes("url") || lowerName.includes("link")) {
      return "https://example.com";
    }
    if (lowerName.includes("active") || lowerName.includes("enabled")) {
      return true;
    }
    if (lowerName.includes("description") || lowerName.includes("content")) {
      return "Sample description text";
    }

    return "Sample Value";
  }

  /**
   * Set nested property in object
   */
  private setNestedProperty(obj: any, path: string, value: any): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Format rendered output
   */
  public formatOutput(output: string, type: "json" | "html" | "text" = "json"): string {
    switch (type) {
      case "json":
        try {
          const parsed = JSON.parse(output);
          return JSON.stringify(parsed, null, 2);
        } catch (error) {
          // Not valid JSON, return as-is
          return output;
        }
      case "html":
        // Basic HTML formatting (could be enhanced)
        return output.replace(/>\s+</g, "><").trim();
      case "text":
      default:
        return output.trim();
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.clearCache();
  }
}
