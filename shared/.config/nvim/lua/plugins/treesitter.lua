return {
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    build = ":TSUpdate",
    config = function()
      local languages = {
        "astro",
        "c",
        "css",
        "dockerfile",
        "elixir",
        "fish",
        "git_config",
        "gleam",
        "go",
        "heex",
        "html",
        "javascript",
        "json",
        "lua",
        "make",
        "markdown",
        "nix",
        "python",
        "sql",
        "styled",
        "svelte",
        "toml",
        "typescript",
        "vim",
        "vimdoc",
        "yaml",
        "zig",
      }

      local ts = require("nvim-treesitter")
      ts.setup({})
      ts.install(languages)

      local group = vim.api.nvim_create_augroup("UserTreesitter", { clear = true })
      vim.api.nvim_create_autocmd("FileType", {
        group = group,
        callback = function(args)
          local ok = pcall(vim.treesitter.start, args.buf)
          if ok then
            vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter-context",
    opts = {
      mode = "topline",
      max_lines = 3,
    },
  },
  {
    "folke/ts-comments.nvim",
    event = "VeryLazy",
    opts = {},
    enabled = vim.fn.has("nvim-0.10.0") == 1,
  },
}
