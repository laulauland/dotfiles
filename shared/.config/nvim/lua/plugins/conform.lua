return {
	'stevearc/conform.nvim',
	config = function()
		require("conform").setup({
			formatters_by_ft = {
				lua = { "stylua" },
				astro = { "prettier", stop_after_first = true },
				typescript = { "biome", "prettier", stop_after_first = true },
				javascript = { "biome", "prettier", stop_after_first = true },
			}
		})

		require("utils").set_keymaps({
			n = {
				["<leader>F"] = {
					function() require("conform").format({ async = true, lsp_format = "fallback" }) end,
					desc = "Format code",
				},
			},
		})
	end
}
