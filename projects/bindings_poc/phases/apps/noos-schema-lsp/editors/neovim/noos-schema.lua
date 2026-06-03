-- no-OS Schema LSP configuration for Neovim
-- Add this to your Neovim configuration (init.lua or after/plugin/)

local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Check if the server is already defined
if not configs.noos_schema then
  configs.noos_schema = {
    default_config = {
      -- Update this path to where you installed the LSP server
      cmd = { 'node', vim.fn.expand('~/.local/share/noos-schema-lsp/dist/server.js'), '--stdio' },
      filetypes = { 'yaml' },
      root_dir = function(fname)
        -- Look for schemas_v2 directory or git root
        local util = require('lspconfig.util')
        return util.root_pattern('schemas_v2', '.git')(fname)
          or util.find_git_ancestor(fname)
      end,
      settings = {},
      single_file_support = false,
    },
  }
end

-- Setup the server
lspconfig.noos_schema.setup({
  on_attach = function(client, bufnr)
    local path = vim.api.nvim_buf_get_name(bufnr)

    -- Only activate for files in schemas_v2 directory
    if not path:match('schemas_v2') then
      vim.lsp.stop_client(client.id)
      return
    end

    -- Set buffer options
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'

    -- Keybindings for LSP features
    local opts = { buffer = bufnr, noremap = true, silent = true }

    -- Go to definition
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)

    -- Hover documentation
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)

    -- Show diagnostics in float
    vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, opts)

    -- Go to next/prev diagnostic
    vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, opts)
    vim.keymap.set('n', ']d', vim.diagnostic.goto_next, opts)

    -- Show document symbols
    vim.keymap.set('n', '<leader>ds', vim.lsp.buf.document_symbol, opts)

    print('no-OS Schema LSP attached to ' .. path)
  end,

  capabilities = vim.lsp.protocol.make_client_capabilities(),
})

-- Optional: Configure diagnostics display
vim.diagnostic.config({
  virtual_text = true,
  signs = true,
  underline = true,
  update_in_insert = false,
  severity_sort = true,
})

-- Optional: Set up signs
local signs = {
  Error = ' ',
  Warn = ' ',
  Hint = ' ',
  Info = ' ',
}
for type, icon in pairs(signs) do
  local hl = 'DiagnosticSign' .. type
  vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
end

print('no-OS Schema LSP configuration loaded')
