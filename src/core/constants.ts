// ============================================================================
// EXTENSION METADATA
// ============================================================================

export const EXTENSION_ID = "mustache-json-validator";
export const EXTENSION_NAME = "Mustache JSON Validator";
export const EXTENSION_DISPLAY_NAME = "Mustache JSON Validator";

// ============================================================================
// LANGUAGE CONFIGURATION
// ============================================================================

export const LANGUAGE_ID = "mustache-json";
export const FILE_EXTENSIONS = [".mustache.json", ".mst.json", ".mustache"] as const;
export const FILE_PATTERNS = ["**/*.mustache.json", "**/*.mst.json", "**/*.mustache"] as const;

// ============================================================================
// COMMAND IDENTIFIERS
// ============================================================================

export const COMMANDS = {
  VALIDATE: "mustacheJsonValidator.validate",
  PREVIEW: "mustacheJsonValidator.previewJson",
  FORMAT: "mustacheJsonValidator.format",
  SELECT_CONTEXT: "mustacheJsonValidator.selectContext",
  CLEAR_CONTEXT: "mustacheJsonValidator.clearContext",
  CLEAR_CACHE: "mustacheJsonValidator.clearCache",
  TOGGLE_VALIDATION: "mustacheJsonValidator.toggleValidation",
} as const;

// ============================================================================
// CONFIGURATION KEYS
// ============================================================================

export const CONFIG_SECTION = "mustacheJsonValidator";

export const CONFIG_KEYS = {
  ENABLE_REAL_TIME_VALIDATION: "enableRealTimeValidation",
  CONTEXT_FILE: "contextFile",
  VALIDATE_JSON_OUTPUT: "validateJsonOutput",
  SHOW_WARNINGS: "showWarnings",
  SHOW_HINTS: "showHints",
  AUTO_FORMAT: "autoFormat",
  MAX_CACHE_SIZE: "maxCacheSize",
  DEBOUNCE_TIME: "debounceTime",
} as const;

// ============================================================================
// DEFAULT CONFIGURATION VALUES
// ============================================================================

export const DEFAULT_CONFIG = {
  enableRealTimeValidation: true,
  contextFile: "",
  validateJsonOutput: true,
  showWarnings: true,
  showHints: true,
  autoFormat: false,
  maxCacheSize: 100,
  debounceTime: 300,
} as const;

// ============================================================================
// MUSTACHE SYNTAX PATTERNS
// ============================================================================

export const MUSTACHE_PATTERNS = {
  // Basic variable: {{variable}}
  VARIABLE: /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Section start: {{#section}}
  SECTION_START: /\{\{\s*#\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Section end: {{/section}}
  SECTION_END: /\{\{\s*\/\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Inverted section: {{^section}}
  INVERTED_SECTION: /\{\{\s*\^\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Comment: {{! comment }}
  COMMENT: /\{\{\s*!\s*(.*?)\s*\}\}/g,

  // Unescaped variable: {{{variable}}} or {{&variable}}
  UNESCAPED_TRIPLE: /\{\{\{\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}\}/g,
  UNESCAPED_AMPERSAND: /\{\{\s*&\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Partial: {{>partial}}
  PARTIAL: /\{\{\s*>\s*([a-zA-Z_][a-zA-Z0-9_.\-]*)\s*\}\}/g,

  // Any mustache tag
  ANY_TAG: /\{\{[^}]*\}\}/g,

  // Unclosed tag
  UNCLOSED_TAG: /\{\{(?![^}]*\}\})/g,

  // Invalid characters in tag names
  INVALID_TAG_CHARS: /\{\{\s*[#^/&>]?\s*[^a-zA-Z_][^}]*\}\}/g,
} as const;

// ============================================================================
// JSON VALIDATION PATTERNS
// ============================================================================

export const JSON_PATTERNS = {
  // Property key pattern
  PROPERTY_KEY: /"([^"\\]*(\\.[^"\\]*)*)"\s*:/g,

  // Trailing comma
  TRAILING_COMMA: /,\s*[}\]]/g,

  // Missing comma
  MISSING_COMMA: /"\s*\n\s*"/g,

  // Unquoted keys (common error)
  UNQUOTED_KEY: /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,

  // Single quotes (should be double)
  SINGLE_QUOTES: /'([^'\\]*(\\.[^'\\]*)*)'/g,
} as const;

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Mustache errors
  MUSTACHE_SYNTAX_ERROR: "M001",
  UNCLOSED_TAG: "M002",
  MISMATCHED_SECTION: "M003",
  INVALID_TAG_NAME: "M004",
  UNKNOWN_VARIABLE: "M005",
  NESTED_SECTIONS: "M006",

  // JSON errors
  JSON_SYNTAX_ERROR: "J001",
  TRAILING_COMMA: "J002",
  MISSING_COMMA: "J003",
  DUPLICATE_KEY: "J004",
  UNQUOTED_KEY: "J005",
  INVALID_ESCAPE: "J006",

  // Context errors
  CONTEXT_FILE_NOT_FOUND: "C001",
  CONTEXT_INVALID_JSON: "C002",
  CONTEXT_READ_ERROR: "C003",

  // Template rendering errors
  RENDER_ERROR: "R001",
  TEMPLATE_COMPILE_ERROR: "R002",
} as const;

// ============================================================================
// DIAGNOSTIC SOURCES
// ============================================================================

export const DIAGNOSTIC_SOURCES = {
  MUSTACHE: "mustache-validator",
  JSON: "json-validator",
  TEMPLATE_ENGINE: "template-engine",
  CONTEXT_LOADER: "context-loader",
} as const;

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export const CACHE_CONFIG = {
  MAX_ENTRIES: 100,
  TTL_MS: 5 * 60 * 1000, // 5 minutes
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
} as const;

// ============================================================================
// PERFORMANCE LIMITS
// ============================================================================

export const PERFORMANCE_LIMITS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_VALIDATION_TIME_MS: 5000,
  DEBOUNCE_TIME_MS: 300,
  MAX_CONCURRENT_VALIDATIONS: 3,
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const UI_CONSTANTS = {
  PREVIEW_PANEL_TITLE: "JSON Preview",
  CONTEXT_SELECTION_PLACEHOLDER: "Select a context file...",
  VALIDATION_STATUS_BAR_PRIORITY: 100,
  NOTIFICATION_TIMEOUT_MS: 5000,
} as const;

// ============================================================================
// FILE SYSTEM
// ============================================================================

export const FILE_SYSTEM = {
  CONTEXT_FILE_EXTENSIONS: [".json"],
  ENCODING: "utf8" as BufferEncoding,
  WATCH_DELAY_MS: 100,
} as const;

// ============================================================================
// REGEX HELPERS
// ============================================================================

export const REGEX_FLAGS = {
  GLOBAL: "g",
  CASE_INSENSITIVE: "i",
  MULTILINE: "m",
  GLOBAL_MULTILINE: "gm",
} as const;

// ============================================================================
// VALIDATION CATEGORIES
// ============================================================================

export const VALIDATION_CATEGORIES = {
  SYNTAX: "Syntax",
  SEMANTIC: "Semantic",
  STYLE: "Style",
  PERFORMANCE: "Performance",
} as const;
