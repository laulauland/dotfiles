return {
	"MeanderingProgrammer/render-markdown.nvim",
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
		"echasnovski/mini.icons",
	},
	-- Don't gate on ft=markdown: when FileType fires for the buffer that
	-- triggers the lazy load, the plugin's own FileType autocmd isn't
	-- registered yet, so the first markdown buffer opens unrendered until
	-- it's re-entered.
	lazy = false,
	opts = {},
}
