# no-OS Schema LSP - VS Code Extension

## Prerequisites

- VS Code 1.75+
- Node.js 18+

## Installation

### Development Installation

1. Build the LSP server:

```bash
cd /path/to/noos-schema-lsp
npm install
npm run build
```

2. Build the VS Code extension:

```bash
cd editors/vscode
npm install
npm run compile
```

3. Install the extension in VS Code:

```bash
# Package the extension
npx @vscode/vsce package

# Install the generated .vsix file
code --install-extension noos-schema-lsp-0.1.0.vsix
```

### Alternative: Development Mode

1. Open the `editors/vscode` directory in VS Code
2. Press `F5` to launch a new Extension Development Host window
3. The extension will be active in the new window

## Configuration

The extension provides the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `noosSchemaLsp.enable` | `true` | Enable/disable the language server |
| `noosSchemaLsp.trace.server` | `off` | Trace communication with server |

## Features

### Diagnostics

Real-time validation shows errors and warnings:

- Missing required fields (`$id`, `$type`, `$name`, `$description`)
- Invalid schema types
- Unknown property fields
- Invalid type references
- Unresolved includes
- Constraint violations

### Completions

Context-aware suggestions:

- Top-level `$` fields
- Field property names
- Type values (primitives and special types)
- Include paths from schema index
- Boolean values

### Hover

Documentation on hover for:

- Meta fields (`$id`, `$type`, etc.)
- Field definitions with type and description
- Primitive types with range information
- Included schemas with field list

### Go to Definition

Jump to included schema files by Ctrl+Click or F12 on:

- `include:` paths
- `target:` references
- Platform includes

### Document Symbols

Outline view showing:

- Schema metadata
- All fields with their types

## Usage

1. Open any `.yaml` file in a `schemas_v2/` directory
2. The extension automatically activates
3. Use standard VS Code LSP features:
   - Hover over elements for documentation
   - Ctrl+Space for completions
   - Ctrl+Click to go to definition
   - View > Outline for document symbols

## Troubleshooting

### Extension not activating

- Check that the file is in a `schemas_v2/` directory
- Check the Output panel (View > Output > no-OS Schema Language Server)

### No completions appearing

- Ensure the schema index was built (check Output panel)
- Try reloading the window (Ctrl+Shift+P > Reload Window)

### Server crashes

- Check the server is built: `npm run build` in the LSP root
- Check Node.js version: `node --version` (need 18+)
