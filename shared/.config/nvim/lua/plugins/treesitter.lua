return {
	{
		"nvim-treesitter/nvim-treesitter",
		lazy = false,
		build = ":TSUpdate",
		config = function()
			require("nvim-treesitter").install({
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
			})

			vim.api.nvim_create_autocmd("FileType", {
				callback = function()
					pcall(vim.treesitter.start)
					vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
				end,
			})
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-context",
		opts = {
			mode = "topline",
			max_lines = 3
		}
	},
	{
		"folke/ts-comments.nvim",
		event = "VeryLazy",
		opts = {},
		enabled = vim.fn.has("nvim-0.10.0") == 1,
	}
}
