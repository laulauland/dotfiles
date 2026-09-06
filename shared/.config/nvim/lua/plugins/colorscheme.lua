local function set_transparent_background()
	vim.api.nvim_set_hl(0, "Normal", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "NormalFloat", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "NormalNC", { bg = "NONE" })
	vim.api.nvim_set_hl(0, "SignColumn", { bg = "NONE" })
end

local function set_markdown_highlights()
	local dark = vim.o.background == "dark"
	local code_bg = dark and "#182325" or "#ececec"
	local accent_fg = dark and "#cc8bc9" or "#7a3e9d"
	local link_fg = dark and "#71aed7" or "#325cc0"
	local quote_fg = dark and "#dfdf8e" or "#aa3731"
	local set = function(group, opts) vim.api.nvim_set_hl(0, group, opts) end

	set("@markup.heading.1.markdown", { fg = accent_fg, bold = true })
	set("@markup.heading.2.markdown", { fg = link_fg, bold = true })
	set("@markup.heading.3.markdown", { bold = true })
	set("@markup.heading.4.markdown", { bold = true })
	set("@markup.heading.5.markdown", { bold = true })
	set("@markup.heading.6.markdown", { bold = true })

	set("@markup.raw.markdown_inline", { bg = code_bg })
	set("@markup.raw.block.markdown", { bg = code_bg })

	set("@markup.link.label.markdown_inline", { fg = link_fg, underline = true })
	set("@markup.link.url.markdown_inline", { fg = link_fg })

	set("@markup.list.markdown", { fg = accent_fg, bold = true })
	set("@markup.quote.markdown", { fg = quote_fg, italic = true })
end

return {
	{
		"p00f/alabaster.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			-- Leave background unset: Neovim follows terminal replies over SSH/Herdr.
			vim.cmd.colorscheme("alabaster")
			set_transparent_background()
			set_markdown_highlights()

			vim.api.nvim_create_autocmd("ColorScheme", {
				pattern = "alabaster",
				callback = function()
					set_transparent_background()
					set_markdown_highlights()
				end,
			})
		end,
	},
}

