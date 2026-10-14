require("mini.pairs").setup()
require("nvim-surround").setup()

require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		astro = { "prettier" },
		javascript = { "biome", "prettier", stop_after_first = true },
		javascriptreact = { "biome", "prettier", stop_after_first = true },
		typescript = { "biome", "prettier", stop_after_first = true },
		typescriptreact = { "biome", "prettier", stop_after_first = true },
		json = { "biome", "prettier", stop_after_first = true },
	},
	default_format_opts = { lsp_format = "fallback" },
})
vim.keymap.set("n", "<leader>F", function() require("conform").format({ async = true }) end, { desc = "Format" })

require("supermaven-nvim").setup({
	log_level = "warn",
	keymaps = {
		accept_suggestion = "<C-y>",
		clear_suggestion = "<C-e>",
	},
})
