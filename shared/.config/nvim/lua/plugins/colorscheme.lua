return {
	{
		"deparr/tairiki.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("tairiki").setup({
				transparent = true,
				palette = "dimmed"
			})
			vim.cmd.colorscheme("tairiki")
		end,
	},
}

