-- Leave 'background' unset: Neovim follows terminal replies over SSH/Herdr.
local function tweak_highlights()
	local set = function(group, opts) vim.api.nvim_set_hl(0, group, opts) end

	-- Transparent background, borders inherit the theme's text color
	for _, group in ipairs({ "Normal", "NormalNC", "NormalFloat", "SignColumn" }) do
		set(group, { bg = "NONE" })
	end
	set("FloatBorder", { fg = "NONE", bg = "NONE" })

	local dark = vim.o.background == "dark"
	local code_bg = dark and "#182325" or "#ececec"
	local accent_fg = dark and "#cc8bc9" or "#7a3e9d"
	local link_fg = dark and "#71aed7" or "#325cc0"
	local quote_fg = dark and "#dfdf8e" or "#aa3731"

	set("@markup.heading.1.markdown", { fg = accent_fg, bold = true })
	set("@markup.heading.2.markdown", { fg = link_fg, bold = true })
	for level = 3, 6 do
		set("@markup.heading." .. level .. ".markdown", { bold = true })
	end
	set("@markup.raw.markdown_inline", { bg = code_bg })
	set("@markup.raw.block.markdown", { bg = code_bg })
	set("@markup.link.label.markdown_inline", { fg = link_fg, underline = true })
	set("@markup.link.url.markdown_inline", { fg = link_fg })
	set("@markup.list.markdown", { fg = accent_fg, bold = true })
	set("@markup.quote.markdown", { fg = quote_fg, italic = true })
end

vim.api.nvim_create_autocmd("ColorScheme", { pattern = "alabaster", callback = tweak_highlights })
vim.cmd.colorscheme("alabaster")
