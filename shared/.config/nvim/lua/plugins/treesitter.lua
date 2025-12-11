return {
	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		config = function()
			local configs = require("nvim-treesitter.configs")

			configs.setup({
				ensure_installed = {
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
					"zig"
				},
				sync_install = false,
				highlight = {
					enable = true,
					additional_vim_regex_highlighting = false,
				},
				indent = { enable = true },
				refactor = {
					highlight_definitions = { enable = true },
					smart_rename = {
						enable = true,
						keymaps = {
							smart_rename = "gR",
						},
					},
					navigation = {
						enable = true,
						keymaps = {
							goto_definition = "gnd",
							list_definitions = "gnD",
						},
					},
				},
				textobjects = {
					move = {
						enable = true,
						set_jumps = true,

						goto_next_start = {
							["]p"] = "@parameter.inner",
							["]f"] = "@function.outer",
							["]]"] = "@class.outer",
						},
						goto_next_end = {
							["]F"] = "@function.outer",
							["]["] = "@class.outer",
						},
						goto_previous_start = {
							["[p"] = "@parameter.inner",
							["[f"] = "@function.outer",
							["[["] = "@class.outer",
						},
						goto_previous_end = {
							["[F"] = "@function.outer",
							["[]"] = "@class.outer",
						},
					},
					select = {
						enable = true,
						lookahead = true,
						keymaps = {
							["af"] = "@function.outer",
							["if"] = "@function.inner",

							["ac"] = "@conditional.outer",
							["ic"] = "@conditional.inner",

							["aa"] = "@parameter.outer",
							["ia"] = "@parameter.inner",

							["av"] = "@variable.outer",
							["iv"] = "@variable.inner",
						},
					},
				},
				incremental_selection = {
					enable = true,
					keymaps = {
						init_selection = "<CR>",
						node_incremental = "<CR>",
						scope_incremental = "<C-n>",
						node_decremental = "<BS>",
					},
				},
				playground = {
					enable = true,
					disable = {},
					updatetime = 25,    -- Debounced time for highlighting nodes in the playground from source code
					persist_queries = false, -- Whether the query persists across vim sessions
					keybindings = {
						toggle_query_editor = "o",
						toggle_hl_groups = "i",
						toggle_injected_languages = "t",
						toggle_anonymous_nodes = "a",
						toggle_language_display = "I",
						focus_language = "f",
						unfocus_language = "F",
						update = "R",
						goto_node = "<cr>",
						show_help = "?",
					},
				},
			})
		end
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
