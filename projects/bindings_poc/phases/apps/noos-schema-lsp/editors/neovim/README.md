# no-OS Schema LSP - Neovim Setup

## Prerequisites

- Neovim 0.8+ with LSP support
- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)
- Node.js 18+

## Installation

### 1. Install the LSP server

```bash
# Clone or copy the LSP server
mkdir -p ~/.local/share/noos-schema-lsp
cp -r /path/to/noos-schema-lsp/* ~/.local/share/noos-schema-lsp/

# Install dependencies and build
cd ~/.local/share/noos-schema-lsp
npm install
npm run build
```

### 2. Configure Neovim

Add the configuration to your Neovim setup. You can either:

**Option A:** Copy `noos-schema.lua` to your Neovim config:

```bash
cp noos-schema.lua ~/.config/nvim/after/plugin/
```

**Option B:** Source it in your `init.lua`:

```lua
dofile(vim.fn.expand('~/.local/share/noos-schema-lsp/editors/neovim/noos-schema.lua'))
```

### 3. Update the server path

Edit `noos-schema.lua` and update the `cmd` path if needed:

```lua
cmd = { 'node', '/your/path/to/noos-schema-lsp/dist/server.js', '--stdio' },
```

## Usage

Open any `.yaml` file in `schemas_v2/` directory. The LSP will automatically activate.

### Keybindings

| Key | Action |
|-----|--------|
| `gd` | Go to definition (jump to included schema) |
| `K` | Show hover documentation |
| `<leader>e` | Show diagnostics in float |
| `[d` / `]d` | Jump to prev/next diagnostic |
| `<leader>ds` | Show document symbols |

### Features

- **Diagnostics**: Real-time validation of schema syntax
- **Completions**: Context-aware suggestions for fields and types
- **Hover**: Documentation for fields, types, and includes
- **Go to Definition**: Jump to included schema files
- **Document Symbols**: Outline view of schema structure

## Troubleshooting

### LSP not starting

Check if the server is installed correctly:

```bash
node ~/.local/share/noos-schema-lsp/dist/server.js --stdio
# Should start without errors (Ctrl+C to exit)
```

### LSP not activating for schema files

The LSP only activates for files in `schemas_v2/` directories. Check your file path.

### Debug mode

Add to your config:

```lua
vim.lsp.set_log_level('debug')
```

Then check `:lua vim.cmd('edit ' .. vim.lsp.get_log_path())`
