return {
	'mrjones2014/smart-splits.nvim',
	config = function()
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
