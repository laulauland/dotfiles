return {
	"sotte/presenting.nvim",
	opts = {
    separator = {
      -- Separators for different filetypes.
      -- You can add your own or oberwrite existing ones.
      -- Note: separators are lua patterns, not regexes.
      markdown = "^%-%-%-$",
    },
    -- Keep the separator, useful if you're parsing based on headings.
    -- If you want to parse on a non-heading separator, e.g. `---` set this to false.
    keep_separator = false,
	},
	cmd = { "Presenting" },
}
