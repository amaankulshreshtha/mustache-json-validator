import * as vscode from "vscode";
import { BaseValidator } from "../base/baseValidator";
import { ValidationResult, ValidationError } from "../../core/types";
import { DIAGNOSTIC_SOURCES, ERROR_CODES } from "../../core/constants";

export class JSONSchemaValidator extends BaseValidator {
  private schemaCache = new Map<string, any>();

  constructor() {
    super("JSONSchemaValidator", DIAGNOSTIC_SOURCES.JSON);
  }

  /**
   * Main validation method
   */
  public async validate(text: string, document?: vscode.TextDocument, schemaUri?: string): Promise<ValidationResult> {
    const startTime = Date.now();
    let errors: ValidationError[] = [];

    if (!schemaUri) {
      return this.createValidationResult([], Date.now() - startTime);
    }

    try {
      // Parse the JSON first
      const jsonData = JSON.parse(text);

      // Load and validate against schema
      const schema = await this.loadSchema(schemaUri);
      if (schema) {
        errors = await this.validateAgainstSchema(jsonData, schema, text);
      }
    } catch (parseError) {
      // JSON parsing failed - skip schema validation
      // The JSON syntax validator should have caught this
    }

    const processingTime = Date.now() - startTime;
    return this.createValidationResult(this.sortErrors(errors), processingTime);
  }

  /**
   * Synchronous validation (limited functionality)
   */
  public validateSync(text: string): ValidationError[] {
    // Schema validation typically requires async operations to load schemas
    // Return empty array for sync validation
    return [];
  }

  /**
   * Load JSON schema from URI
   */
  private async loadSchema(schemaUri: string): Promise<any | null> {
    try {
      // Check cache first
      if (this.schemaCache.has(schemaUri)) {
        return this.schemaCache.get(schemaUri);
      }

      let schema: any;

      if (schemaUri.startsWith("http://") || schemaUri.startsWith("https://")) {
        // Load from HTTP/HTTPS
        schema = await this.loadSchemaFromUrl(schemaUri);
      } else {
        // Load from file system
        schema = await this.loadSchemaFromFile(schemaUri);
      }

      if (schema) {
        // Cache the schema
        this.schemaCache.set(schemaUri, schema);
      }

      return schema;
    } catch (error) {
      console.error(`Failed to load schema from ${schemaUri}:`, error);
      return null;
    }
  }

  /**
   * Load schema from URL
   */
  private async loadSchemaFromUrl(url: string): Promise<any | null> {
    try {
      // In a real implementation, you would use fetch or similar
      // For now, return null as we can't make HTTP requests in this context
      console.warn(`HTTP schema loading not implemented: ${url}`);
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load schema from file system
   */
  private async loadSchemaFromFile(filePath: string): Promise<any | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const textContent = Buffer.from(content).toString("utf8");
      return JSON.parse(textContent);
    } catch (error) {
      console.error(`Failed to load schema from file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Validate JSON data against schema
   */
  private async validateAgainstSchema(data: any, schema: any, originalText: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // Basic schema validation (simplified implementation)
      // In a real implementation, you'd use a proper JSON Schema validator like ajv
      errors.push(...this.validateType(data, schema, originalText));
      errors.push(...this.validateRequired(data, schema, originalText));
      errors.push(...(await this.validateProperties(data, schema, originalText)));
      errors.push(...(await this.validateArray(data, schema, originalText)));
    } catch (error) {
      errors.push(
        this.createValidationError(
          `Schema validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Validate data type against schema
   */
  private validateType(data: any, schema: any, originalText: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!schema.type) {
      return errors;
    }

    const actualType = this.getJSONType(data);
    const expectedType = schema.type;

    if (actualType !== expectedType) {
      const location = this.findValueLocation(originalText, data);
      errors.push(
        this.createValidationError(
          `Expected type "${expectedType}" but got "${actualType}"`,
          location.line,
          location.column,
          "error",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Validate required properties
   */
  private validateRequired(data: any, schema: any, originalText: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!schema.required || !Array.isArray(schema.required) || typeof data !== "object" || data === null) {
      return errors;
    }

    for (const requiredProp of schema.required) {
      if (!(requiredProp in data)) {
        errors.push(
          this.createValidationError(
            `Missing required property: "${requiredProp}"`,
            1,
            0,
            "error",
            undefined,
            ERROR_CODES.JSON_SYNTAX_ERROR
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate object properties against schema
   */
  private async validateProperties(data: any, schema: any, originalText: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (!schema.properties || typeof data !== "object" || data === null || Array.isArray(data)) {
      return errors;
    }

    for (const [propName, propValue] of Object.entries(data)) {
      const propSchema = schema.properties[propName];

      if (propSchema) {
        // Recursively validate property
        const propErrors = await this.validateAgainstSchema(propValue, propSchema, originalText);
        errors.push(...propErrors);
      } else if (schema.additionalProperties === false) {
        const location = this.findPropertyLocation(originalText, propName);
        errors.push(
          this.createValidationError(
            `Additional property "${propName}" is not allowed`,
            location.line,
            location.column,
            "error",
            propName.length + 2, // Include quotes
            ERROR_CODES.JSON_SYNTAX_ERROR
          )
        );
      }
    }

    return errors;
  }

  /**
   * Validate array against schema
   */
  private async validateArray(data: any, schema: any, originalText: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (!Array.isArray(data) || !schema.items) {
      return errors;
    }

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const itemErrors = await this.validateAgainstSchema(item, schema.items, originalText);
      errors.push(...itemErrors);
    }

    // Validate array constraints
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(
        this.createValidationError(
          `Array should have at least ${schema.minItems} items, but has ${data.length}`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    if (schema.maxItems && data.length > schema.maxItems) {
      errors.push(
        this.createValidationError(
          `Array should have at most ${schema.maxItems} items, but has ${data.length}`,
          1,
          0,
          "error",
          undefined,
          ERROR_CODES.JSON_SYNTAX_ERROR
        )
      );
    }

    return errors;
  }

  /**
   * Get JSON type of a value
   */
  private getJSONType(value: any): string {
    if (value === null) {
      return "null";
    }
    if (Array.isArray(value)) {
      return "array";
    }
    return typeof value;
  }

  /**
   * Find location of a value in original text (simplified)
   */
  private findValueLocation(text: string, value: any): { line: number; column: number } {
    // This is a simplified implementation
    // In practice, you'd need more sophisticated parsing to find exact locations
    const valueStr = JSON.stringify(value);
    const index = text.indexOf(valueStr);

    if (index !== -1) {
      return this.getLineColumnFromPosition(text, index);
    }

    return { line: 1, column: 0 };
  }

  /**
   * Find location of a property in original text
   */
  private findPropertyLocation(text: string, propertyName: string): { line: number; column: number } {
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const propertyIndex = line.indexOf(`"${propertyName}"`);

      if (propertyIndex !== -1) {
        return {
          line: i + 1,
          column: propertyIndex,
        };
      }
    }

    return { line: 1, column: 0 };
  }

  /**
   * Clear schema cache
   */
  public clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Validate schema file itself
   */
  public async validateSchemaFile(schemaText: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      const schema = JSON.parse(schemaText);

      // Basic schema validation
      if (!schema.$schema) {
        errors.push(
          this.createValidationError("Schema should have a $schema property", 1, 0, "warning", undefined, ERROR_CODES.JSON_SYNTAX_ERROR)
        );
      }

      if (!schema.type) {
        errors.push(this.createValidationError("Schema should specify a type", 1, 0, "warning", undefined, ERROR_CODES.JSON_SYNTAX_ERROR));
      }
    } catch (parseError) {
      errors.push(this.createValidationError("Invalid JSON schema file", 1, 0, "error", undefined, ERROR_CODES.JSON_SYNTAX_ERROR));
    }

    return errors;
  }

  /**
   * Get available schemas
   */
  public getAvailableSchemas(): string[] {
    return Array.from(this.schemaCache.keys());
  }

  /**
   * Preload common schemas
   */
  public async preloadCommonSchemas(): Promise<void> {
    const commonSchemas: string[] = [
      // Add paths to common schemas used in your project
    ];

    for (const schemaPath of commonSchemas) {
      try {
        await this.loadSchema(schemaPath);
      } catch (error) {
        console.warn(`Failed to preload schema: ${schemaPath}`, error);
      }
    }
  }
}
