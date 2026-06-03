# no-OS Schema Language Server

Language Server Protocol (LSP) implementation for no-OS YAML schema files. Provides real-time validation, intelligent completions, and hover documentation for schema development.

## Features

- **Diagnostics**: Real-time validation against schema rules
  - Missing required fields
  - Invalid types and properties
  - Unresolved includes
  - Constraint violations

- **Completions**: Context-aware suggestions
  - Top-level meta fields (`$id`, `$type`, etc.)
  - Field properties based on type
  - Primitive and special types
  - Include paths from indexed schemas

- **Hover**: Documentation on hover
  - Field descriptions and types
  - Primitive type ranges
  - Included schema summaries

- **Go to Definition**: Navigation to included schemas

- **Document Symbols**: Outline view of schema structure

## Quick Start

```bash
# Install dependencies
npm install

# Build the server
npm run build

# Run the server (for testing)
npm start
```

## Editor Setup

### VS Code

See [editors/vscode/README.md](editors/vscode/README.md)

```bash
cd editors/vscode
npm install
npm run package
code --install-extension noos-schema-lsp-0.1.0.vsix
```

### Neovim

See [editors/neovim/README.md](editors/neovim/README.md)

```lua
-- Add to your Neovim config
dofile('/path/to/noos-schema-lsp/editors/neovim/noos-schema.lua')
```

## Schema Validation

The LSP validates schemas against these rules:

### Required Top-Level Fields

- `$id`: Unique identifier
- `$type`: Schema type (`struct`, `enum`, `union`, `platform_ops`)
- `$name`: C type name
- `$description`: Documentation

### Field Properties

Fields must have either `type` or `include` (mutually exclusive):

**With `type`:**
- Primitive: `uint8_t`, `uint16_t`, `uint32_t`, `int8_t`, `int16_t`, `int32_t`, `bool`, `size_t`
- Special: `enum`, `union`, `array`, `const_ptr`, `platform_extra`, `platform_ops`

**With `include`:**
- Path to another schema file
- Optional `pointer: true`

### Type-Specific Properties

| Type | Required Properties |
|------|---------------------|
| `array` | `size`, `element` |
| `enum` | `values` |
| `union` | `selector`, `members` |
| `const_ptr` | `target` |
| `platform_extra` | `platforms` |
| `platform_ops` | `platforms`, `target` |

## Architecture

```
src/
├── server.ts        # LSP server entry point
├── parser.ts        # YAML parsing with positions
├── validator.ts     # Schema validation
├── completions.ts   # Completion provider
├── hover.ts         # Hover information
├── definitions.ts   # Go to definition
├── schema-index.ts  # Schema directory indexer
├── meta-schema.ts   # Validation rules
└── types.ts         # TypeScript interfaces
```

## Development

```bash
# Build in watch mode
npm run watch

# Run tests
npm test
```

## Requirements

- Node.js 18+
- TypeScript 5+
