return {
	"stevearc/aerial.nvim",
	keys = {
		{
			"gs",
			function()
				require("aerial").refetch_symbols()
				vim.cmd.AerialToggle("float")
				vim.cmd.doautocmd("BufWinEnter")
			end
			,
			desc = "Toggle Aerial"
		},
	},
	config = function()
		require("aerial").setup({
			show_guides = true,
			backends = { "lsp", "treesitter", "markdown", "man" },
			highlight_on_hover = true,
			close_on_select = true,
			filter_kind = {
				"Class",
				"Constructor",
				"Enum",
				"Function",
				"Interface",
				"Module",
				"Method",
				"Struct",
				"Variable",
			},
			close_automatic_events = {
				"unfocus",
				"switch_buffer",
				"unsupported",
			},
			keymaps = {
				["<esc>"] = "actions.close",
				["<C-n>"] = "actions.down_and_scroll",
				["<C-p>"] = "actions.up_and_scroll",
			},
		})

		require("utils").set_keymaps({
			n = {
				["gs"] = {
					function()
						-- NOTE: Workaround for https://github.com/stevearc/aerial.nvim/issues/331
						require("aerial").refetch_symbols()
						vim.cmd.AerialToggle("float")
						vim.cmd.doautocmd("BufWinEnter")
					end,
					desc = "Show document symbols",
				},
			}
		})
	end
}
