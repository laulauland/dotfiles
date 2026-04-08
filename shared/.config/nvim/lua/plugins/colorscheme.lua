local function detect_background()
	local nvim_background = vim.env.NVIM_BACKGROUND and vim.env.NVIM_BACKGROUND:lower() or nil
	if nvim_background == "light" or nvim_background == "dark" then return nvim_background end

	if vim.fn.has("macunix") == 1 then
		local appearance = vim.fn.system({ "defaults", "read", "-g", "AppleInterfaceStyle" })
		if vim.v.shell_error == 0 and appearance:match("Dark") then return "dark" end
		return "light"
	end

	local terminal_background = vim.env.TERM_BACKGROUND and vim.env.TERM_BACKGROUND:lower() or nil
	if terminal_background == "light" or terminal_background == "dark" then return terminal_background end

	local colorfgbg = vim.env.COLORFGBG
	local bg_code = colorfgbg and tonumber(colorfgbg:match("(%d+)$")) or nil
	if bg_code then
		if bg_code <= 6 then return "dark" end
		if bg_code >= 7 then return "light" end
	end

	return vim.o.background
end

local function set_transparent_background()
	vim.api.nvim_set_hl(0, "Normal", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "NormalFloat", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "NormalNC", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "SignColumn", { bg = "NONE" })
end

return {
	{
		"p00f/alabaster.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			vim.o.background = detect_background()
			vim.cmd.colorscheme("alabaster")
			set_transparent_background()

			vim.api.nvim_create_autocmd("ColorScheme", {
				pattern = "alabaster",
				callback = set_transparent_background,
			})
		end,
	},
}

