return {
	{
		"p00f/alabaster.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			vim.o.background = "light"
			vim.cmd.colorscheme("alabaster")
			-- Transparent background (let terminal show through)
			vim.api.nvim_set_hl(0, "Normal", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "NormalFloat", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "NormalNC", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "SignColumn", { bg = "NONE" })
		end,
	},
}

