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

      local treesitter = require("nvim-treesitter")
      local installed = treesitter.get_installed("parsers")
      local missing = vim.tbl_filter(function(language)
        return not vim.tbl_contains(installed, language)
      end, languages)

      if #missing > 0 then
        treesitter.install(missing, { summary = true })
      end

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
