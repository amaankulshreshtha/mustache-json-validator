# Mustache JSON Validator

A VSCode extension that provides static analysis and validation for Mustache templates that generate JSON output.

## Features

### ✅ Core Features

- **Mustache Syntax Validation**: Real-time syntax checking for Mustache templates
- **Section Block Validation**: Ensures proper opening/closing of `{{#section}}` and `{{/section}}` blocks
- **JSON Output Validation**: Validates that the generated JSON has correct syntax
- **Real-time Error Highlighting**: Shows errors as you type with detailed error messages

### 🔧 Additional Validations

- Unclosed Mustache tags detection
- Mismatched section blocks
- Invalid tag syntax patterns
- Duplicate JSON keys detection
- Basic JSON structure validation

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Open in VSCode and press `F5` to run the extension in a new Extension Development Host window

## Usage

### File Extensions

The extension activates for files with these extensions:

- `.mustache.json`
- `.mst.json`
- Any `.mustache` file containing JSON-like content

### Commands

- `Mustache JSON: Validate` - Manually trigger validation
- `Mustache JSON: Preview Generated JSON` - See the rendered JSON output

### Configuration

Set these options in your VSCode settings:

```json
{
  "mustacheJsonValidator.enableRealTimeValidation": true,
  "mustacheJsonValidator.contextFile": "./examples/context.json"
}
```

## Example Template

```mustache
{
  "users": [
    {{#users}}
    {
      "id": {{id}},
      "name": "{{name}}",
      {{#isActive}}
      "status": "active"
      {{/isActive}}
      {{^isActive}}
      "status": "inactive"
      {{/isActive}}
    }{{^@last}},{{/@last}}
    {{/users}}
  ]
}
```

## Error Types

The extension catches and highlights these types of issues:

### Mustache Errors

- **Unclosed tags**: `{{ variable` (missing closing `}}`)
- **Mismatched sections**: `{{#users}} ... {{/user}}` (typo in closing tag)
- **Invalid syntax**: `{{# }}` (section without name)

### JSON Errors

- **Invalid JSON syntax**: Missing commas, trailing commas, malformed strings
- **Duplicate keys**: Same property name used twice in an object
- **Type mismatches**: When using JSON schema validation

## Development

### Project Structure

```
├── src/
│   ├── extension.ts              # Main extension entry point
│   ├── validators/
│   │   ├── mustacheValidator.ts  # Mustache syntax validation
│   │   └── jsonValidator.ts      # JSON output validation
│   └── providers/
│       └── diagnosticsProvider.ts # Error display management
├── syntaxes/
│   └── mustache-json.tmLanguage.json # Syntax highlighting
├── examples/
│   ├── sample.mustache.json      # Example template
│   └── context.json             # Example context data
└── package.json
```

### Building

```bash
npm run compile
```

### Testing

Create test files in your workspace with `.mustache.json` extension and start editing to see validation in action.

## Roadmap

Future enhancements could include:

- Context file auto-detection
- Variable usage validation against context
- Auto-completion for Mustache variables
- JSON Schema integration
- Performance optimization for large templates
- Code actions for quick fixes

## Contributing

This is a foundational implementation. Pull requests welcome for additional features and improvements!
