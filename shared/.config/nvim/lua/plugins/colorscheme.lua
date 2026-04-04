return {
	{
		"p00f/alabaster.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			-- Read theme from shared config file
			local theme_file = vim.fn.expand("~/.config/theme/current")
			local theme = "light"
			local f = io.open(theme_file, "r")
			if f then
				theme = f:read("*l"):gsub("%s+", "")
				f:close()
			end

			-- Set background and colorscheme based on theme
			if theme == "dark" then
				vim.o.background = "dark"
				-- Use a dark colorscheme (fallback to builtin if alabaster doesn't have dark)
				vim.cmd.colorscheme("default")
			else
				vim.o.background = "light"
				vim.cmd.colorscheme("alabaster")
			end

			-- Transparent background (let terminal show through)
			vim.api.nvim_set_hl(0, "Normal", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "NormalFloat", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "NormalNC", { bg = "NONE" })
			vim.api.nvim_set_hl(0, "SignColumn", { bg = "NONE" })
		end,
	},
}
