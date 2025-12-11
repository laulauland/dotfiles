return {
	{
		"supermaven-inc/supermaven-nvim",
		config = function()
			require("supermaven-nvim").setup({
				log_level = "warn",
				keymaps = {
					accept_suggestion = "<C-y>",
					clear_suggestion = "<C-e>",
				},
				-- color = {
				-- 	suggestion_color = "#6e6a86",
				-- 	cterm = 8,
				-- },
			})
		end,
	},
}
