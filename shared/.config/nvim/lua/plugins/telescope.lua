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
			"nvim-telescope/telescope-live-grep-args.nvim",
			"zschreur/telescope-jj.nvim",
		},
		config = function()
			local actions = require("telescope.actions")
			local actions_layout = require("telescope.actions.layout")
			local builtin = require("telescope.builtin")
			local telescope = require("telescope")
			local jj = require("core.telescope_jj")

			local function project_files(opts)
				opts = opts or {}

				local jj_ok, jj_err = pcall(function()
					telescope.extensions.jj.files(opts)
				end)
				if jj_ok then
					return
				end

				local git_ok, git_err = pcall(function()
					builtin.git_files(opts)
				end)
				if git_ok then
					return
				end

				error("Could not launch jj/git files:\n" .. tostring(jj_err) .. "\n" .. tostring(git_err))
			end

			telescope.setup({
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
							["<C-r><C-w>"] = false,
							["<C-r><C-a>"] = false,
							["<C-r><C-f>"] = false,
							["<C-r><C-l>"] = false,
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
					["<S-C-p>"] = { function() builtin.commands() end, desc = "Open command finder" },
					["<C-p>"] = { function() builtin.find_files() end, desc = "Open fuzzy finder" },
					["<leader><leader>"] = { function() builtin.commands() end, desc = "Command palette" },
					["<leader>b"] = { function() builtin.buffers() end, desc = "Open buffers" },
					["<leader>ff"] = { function() builtin.find_files() end, desc = "Open fuzzy finder" },
					["<leader>fF"] = { function() builtin.find_files({ hidden = true }) end, desc = "Open fuzzy finder ALL" },
					["<leader>fd"] = { jj.open_diff, desc = "Diff vs trunk" },
					["<leader>fg"] = { project_files, desc = "Open VCS files" },
					["<leader>fw"] = { function() telescope.extensions.live_grep_args.live_grep_args() end, desc = "Open live grep" },
					["<leader>fh"] = { function() builtin.help_tags() end, desc = "Open help finder" },
					["<leader>fm"] = { function() builtin.marks() end, desc = "Open mark finder" },
					["<leader>fs"] = { function() builtin.lsp_dynamic_workspace_symbols() end, desc = "List all symbols", },
				}
			})

			-- require("telescope").load_extension("zf-native")
			telescope.load_extension("jj")
			telescope.load_extension("live_grep_args")
		end
	}
}
