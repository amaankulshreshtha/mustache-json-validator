import * as vscode from "vscode";

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationError {
  message: string;
  line: number;
  column: number;
  severity: ValidationSeverity;
  length?: number;
  code?: string;
  source?: string;
  tags?: ValidationTag[];
}

export type ValidationSeverity = "error" | "warning" | "info" | "hint";

export enum ValidationTag {
  Syntax = "syntax",
  Semantic = "semantic",
  Style = "style",
  Performance = "performance",
}

export interface ValidationResult {
  errors: ValidationError[];
  isValid: boolean;
  processingTime?: number;
}

// ============================================================================
// MUSTACHE TYPES
// ============================================================================

export interface MustacheSection {
  name: string;
  type: SectionType;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
  length: number;
}

export enum SectionType {
  Normal = "normal", // {{#section}}
  Inverted = "inverted", // {{^section}}
  Closing = "closing", // {{/section}}
}

export interface MustacheVariable {
  name: string;
  line: number;
  column: number;
  length: number;
  isEscaped: boolean;
  isTripleBrace: boolean;
}

export interface MustacheComment {
  content: string;
  line: number;
  column: number;
  length: number;
}

export interface ParsedMustacheTemplate {
  sections: MustacheSection[];
  variables: MustacheVariable[];
  comments: MustacheComment[];
  errors: ValidationError[];
}

// ============================================================================
// JSON TYPES
// ============================================================================

export interface JSONValidationOptions {
  allowTrailingComma?: boolean;
  allowComments?: boolean;
  validateSchema?: boolean;
  schemaUri?: string;
}

export interface JSONProperty {
  key: string;
  value: any;
  line: number;
  column: number;
  keyRange: vscode.Range;
  valueRange: vscode.Range;
}

export interface DuplicateKey {
  key: string;
  occurrences: Array<{
    line: number;
    column: number;
  }>;
}

// ============================================================================
// TEMPLATE ENGINE TYPES
// ============================================================================

export interface TemplateContext {
  [key: string]: any;
}

export interface RenderOptions {
  context: TemplateContext;
  partials?: { [name: string]: string };
  helpers?: { [name: string]: Function };
}

export interface RenderResult {
  output: string;
  success: boolean;
  error?: string;
  variables: string[];
  sections: string[];
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export interface DiagnosticInfo {
  range: vscode.Range;
  message: string;
  severity: vscode.DiagnosticSeverity;
  code?: string;
  source?: string;
  relatedInformation?: vscode.DiagnosticRelatedInformation[];
}

export interface CompletionItemInfo {
  label: string;
  kind: vscode.CompletionItemKind;
  detail?: string;
  documentation?: string | vscode.MarkdownString;
  insertText?: string | vscode.SnippetString;
  range?: vscode.Range;
}

export interface HoverInfo {
  contents: vscode.MarkdownString[];
  range?: vscode.Range;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface ExtensionConfig {
  enableRealTimeValidation: boolean;
  contextFile: string;
  validateJsonOutput: boolean;
  showWarnings: boolean;
  showHints: boolean;
  autoFormat: boolean;
  maxCacheSize: number;
  debounceTime: number;
}

export interface ContextFileInfo {
  path: string;
  exists: boolean;
  isValid: boolean;
  lastModified: number;
  content?: TemplateContext;
  error?: string;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
}

export interface ValidationCache {
  mustache: Map<string, CacheEntry<ValidationResult>>;
  json: Map<string, CacheEntry<ValidationResult>>;
  context: Map<string, CacheEntry<TemplateContext>>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface DocumentChangeEvent {
  document: vscode.TextDocument;
  changes: readonly vscode.TextDocumentContentChangeEvent[];
}

export interface ContextChangeEvent {
  path: string;
  content: TemplateContext;
  isValid: boolean;
}

export interface ValidationCompleteEvent {
  document: vscode.TextDocument;
  result: ValidationResult;
  duration: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type FileExtension = ".mustache.json" | ".mst.json" | ".mustache";

export interface FileInfo {
  path: string;
  extension: FileExtension;
  size: number;
  lastModified: number;
}

export interface TextRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

// ============================================================================
// COMMAND TYPES
// ============================================================================

export interface CommandContext {
  document: vscode.TextDocument;
  selection?: vscode.Selection;
  config: ExtensionConfig;
}

export interface PreviewOptions {
  showInSidePanel?: boolean;
  autoRefresh?: boolean;
  formatOutput?: boolean;
}
