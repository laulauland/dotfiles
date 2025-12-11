# LSP Configuration Changes

## Issues Fixed

### 1. LSP Hover Border Not Working
**Problem**: Hover popups didn't show rounded borders despite configuration
**Root Cause**: Handler configuration was inside LspAttach autocmd, conflicting with keybinds setup
**Solution**: Moved handlers to global scope after diagnostic config

### 2. vtsls Not Picking Up TypeScript Configs in services-api
**Problem**: TypeScript LSP couldn't understand the complex multi-config monorepo structure
**Root Cause**: services-api has separate `tsconfig.client.json` and `tsconfig.worker.json` files
**Solution**: Enhanced root directory detection and workspace-specific configuration

## Changes Made

### Hover Border Fix
```lua
-- Moved from LspAttach autocmd to global scope
vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, {
  border = "rounded",
  max_width = 65,
  max_height = 30,
})

vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, {
  border = "rounded",
  max_width = 65,
  max_height = 30,
  silent = true,
  focusable = false,
})
```

### vtsls TypeScript Configuration
```lua
vtsls = {
  -- Added explicit filetypes and disabled single file support
  filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
  single_file_support = false,
  
  settings = {
    vtsls = {
      enableMoveToFileCodeAction = true,
      autoUseWorkspaceTsdk = true, -- Auto-detect workspace TypeScript
      experimental = {
        completion = {
          enableServerSideFuzzyMatch = true,
        },
      },
    },
    -- Enhanced preferences for better auto-imports and completion
    typescript = {
      updateImportsOnFileMove = { enabled = "always" },
      preferences = {
        includePackageJsonAutoImports = "on",
        useAliasesForRenames = false,
      },
    },
  },
  
  -- Custom root directory detection for services-api
  root_dir = function(fname)
    local util = require("lspconfig.util")
    -- Prioritize specific tsconfig files
    local client_config = util.root_pattern("tsconfig.client.json")(fname)
    local worker_config = util.root_pattern("tsconfig.worker.json")(fname)
    local general_config = util.root_pattern("tsconfig.json")(fname)
    local package_json = util.root_pattern("package.json")(fname)
    
    return client_config or worker_config or general_config or package_json
  end,
}
```

### Custom Handler for services-api
```lua
-- Added special handling in mason-lspconfig setup
if server_name == "vtsls" then
  server.on_new_config = function(new_config, new_root_dir)
    -- Force vtsls to use the correct tsconfig based on file location
    if new_root_dir:match("services%-api") then
      -- Check if we're in client directory
      if vim.fn.getcwd():match("client") or vim.fn.expand("%:p"):match("client") then
        new_config.init_options = vim.tbl_deep_extend("force", new_config.init_options or {}, {
          typescript = {
            tsdk = new_root_dir .. "/node_modules/typescript/lib"
          }
        })
      end
    end
  end
end
```

## Testing

1. **Restart Neovim** completely
2. **Open TypeScript files** in services-api (both `src/client/` and `src/` directories)
3. **Test hover** with `K` key - should show rounded borders
4. **Check LSP status** with `:LspInfo` to verify vtsls attachment
5. **Test completion** and imports in both client and worker code

## Troubleshooting

If issues persist:
- Check `:LspLog` for error messages
- Verify TypeScript installation: `which typescript` in services-api
- Consider switching to `typescript-tools.nvim` for better monorepo support
- Add workspace-specific `.nvim.lua` configuration files

## services-api TypeScript Structure

```
apps/services-api/
├── tsconfig.client.json    # React frontend (src/client/**)
├── tsconfig.worker.json    # Cloudflare Worker (src/**)
├── tsconfig.json          # Root config with project references
└── src/
    ├── client/            # Uses tsconfig.client.json
    └── routes/            # Uses tsconfig.worker.json
```

The configuration now properly detects and handles this dual-config structure.