return {
	'mrjones2014/smart-splits.nvim',
	config = function()
		-- Inside a tmux popup the outer TMUX_PANE points at a pane the popup
		-- server can't address, so the multiplexer integration surfaces errors
		-- on every edge navigation. Disable the integration in that context.
		require("smart-splits").setup({
			multiplexer_integration = vim.env.NVIM_IN_TMUX_POPUP == "1" and false or nil,
		})
		require("utils").set_keymaps({
			[{ "n", "v", "t" }] = {
				["<C-h>"] = {
					function() require("smart-splits").move_cursor_left() end,
					desc = "Move to left split",
				},
				["<C-j>"] = {
					function() require("smart-splits").move_cursor_down() end,
					desc = "Move to below split",
				},
				["<C-k>"] = {
					function() require("smart-splits").move_cursor_up() end,
					desc = "Move to above split",
				},
				["<C-l>"] = {
					function() require("smart-splits").move_cursor_right() end,
					desc = "Move to right split",
				},
			},
			[{ "n", "v" }] = {
				["<Left>"] = {
					function() require("smart-splits").resize_left() end,
					desc = "Resize left",
				},
				["<Down>"] = {
					function() require("smart-splits").resize_down() end,
					desc = "Resize down",
				},
				["<Up>"] = {
					function() require("smart-splits").resize_up() end,
					desc = "Resize up",
				},
				["<Right>"] = {
					function() require("smart-splits").resize_right() end,
					desc = "Resize right",
				},
			}
		})
	end
}
