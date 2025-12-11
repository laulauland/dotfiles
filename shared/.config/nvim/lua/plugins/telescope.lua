return {
	-- {
	-- 	"ibhagwan/fzf-lua",
	-- 	config = function()
	-- 		require("fzf-lua").setup("max-perf", { fzf_color = true })
	-- 		local set_keymaps = require("utils").set_keymaps
	-- 		set_keymaps({
	-- 			n = {
	-- 				["<leader>ff"] = { function() require('fzf-lua').files() end, desc = "Open fuzzy finder" },
	-- 				["<leader>fw"] = { function() require('fzf-lua').live_grep() end, desc = "Open fuzzy finder" },
	-- 				["<leader>fh"] = { function() require('fzf-lua').helptags() end, desc = "Open fuzzy finder" },
	-- 			}
	-- 		})
	-- 	end
	-- },
	{
		"nvim-telescope/telescope.nvim",
		dependencies = {
			-- "natecraddock/telescope-zf-native.nvim",
			"nvim-telescope/telescope-live-grep-args.nvim"
		},
		config = function()
			local actions = require("telescope.actions")
			local actions_layout = require("telescope.actions.layout")

			require("telescope").setup({
				defaults = {
					color_devicons = false,
					disable_devicons = true,
					path_display = { "truncate" },
					dynamic_preview_title = true,
					sorting_strategy = "descending",
					layout_strategy = "flex",
					-- layout_config = {
					-- 	flip_columns = 160,
					-- },
					preview = {
						filesize_limit = 0.1,
					},

					mappings = {
						i = {
							["<esc>"] = actions.close,
							["<C-CR>"] = actions.file_vsplit,
							["<M-p>"] = actions_layout.toggle_preview,
						},
						n = {
							["q"] = actions.close,
							["<M-p>"] = actions_layout.toggle_preview,
						},
					},
				},

				extensions = {
					-- ["zf-native"] = {
					-- 	file = {
					-- 		-- override default telescope file sorter
					-- 		enable = true,
					--
					-- 		-- highlight matching text in results
					-- 		highlight_results = true,
					--
					-- 		-- enable zf filename match priority
					-- 		match_filename = true,
					-- 	},
					--
					-- 	-- options for sorting all other items
					-- 	generic = {
					-- 		-- override default telescope generic item sorter
					-- 		enable = true,
					--
					-- 		-- highlight matching text in results
					-- 		highlight_results = true,
					--
					-- 		-- disable zf filename match priority
					-- 		match_filename = false,
					-- 	},
					-- },
				},
			})


			local set_keymaps = require("utils").set_keymaps
			set_keymaps({
				n = {
					["<S-C-p>"] = { function() require("telescope.builtin").commands() end, desc = "Open command finder" },
					["<C-p>"] = { function() require("telescope.builtin").find_files() end, desc = "Open fuzzy finder" },
					["<leader>b"] = { function() require("telescope.builtin").buffers() end, desc = "Open buffers" },
					["<leader>ff"] = { function() require("telescope.builtin").find_files() end, desc = "Open fuzzy finder" },
					["<leader>fF"] = { function() require("telescope.builtin").find_files({ hidden = true }) end, desc = "Open fuzzy finder ALL" },
					["<leader>fw"] = { function() require("telescope").extensions.live_grep_args.live_grep_args() end, desc = "Open live grep" },
					["<leader>fh"] = { function() require("telescope.builtin").help_tags() end, desc = "Open help finder" },
					["<leader>fm"] = { function() require("telescope.builtin").marks() end, desc = "Open mark finder" },
					["gS"] = { function() require("telescope.builtin").lsp_dynamic_workspace_symbols() end, desc = "List all symbols", },
				}
			})

			-- require("telescope").load_extension("zf-native")
			require("telescope").load_extension("live_grep_args")
		end
	}
}
