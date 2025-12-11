return {
	{
		"neovim/nvim-lspconfig",
		dependencies = {
			"williamboman/mason.nvim",
			"williamboman/mason-lspconfig.nvim",
			-- "saghen/blink.cmp",
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-buffer",
			"hrsh7th/cmp-path",
			"hrsh7th/cmp-cmdline",
			"hrsh7th/nvim-cmp",
			"L3MON4D3/LuaSnip",
			"saadparwaiz1/cmp_luasnip",
			"j-hui/fidget.nvim",
			"b0o/schemastore.nvim",
			"pmizio/typescript-tools.nvim",
			"dmmulroy/ts-error-translator.nvim"
		},
		config = function(_)
			require("plugins.lsp.style").setup()
			require("plugins.lsp.keymaps").setup()


			require("plugins.lsp.completions").setup()
			local capabilities = require("plugins.lsp.completions").capabilities()

			require("fidget").setup({})
			require("mason").setup()

			local lspconfig = require("lspconfig")

			require("typescript-tools").setup({
				capabilities = capabilities,
				server_capabilities = {
					documentFormattingProvider = false,
				},
				settings = {
					expose_as_code_action = "all"
				}
			})

			require("ts-error-translator").setup()

			require("mason-lspconfig").setup({
				automatic_installation = false,

				ensure_installed = {
					"astro",
					"cssls",
					"emmet_language_server",
					"html",
					"jsonls",
					"lua_ls",
					"rust_analyzer",
					"tailwindcss",
					"ts_ls"
				},
				handlers = {
					function(server_name) -- default handler (optional)
						lspconfig[server_name].setup {
							capabilities = capabilities
						}
					end,
					["ts_ls"] = function()
						-- managed by typescript-tools
					end,
					["jsonls"] = function()
						lspconfig.jsonls.setup {
							settings = {
								json = {
									schemas = require("schemastore").json.schemas(),
									validate = { enable = true },
								},
							},
						}
					end
					,
				}
			})
		end
	},
	{
		"dmmulroy/tsc.nvim",
		config = function()
			require("tsc").setup({
				-- enable_progress_notifications = false,
				use_diagnostics = true,
				use_trouble_qflist = true,
			})
		end,
	},
	{
		"folke/lazydev.nvim",
		ft = "lua", -- only load on lua files
		opts = {
			library = {
				-- See the configuration section for more details
				-- Load luvit types when the `vim.uv` word is found
				{ path = "luvit-meta/library", words = { "vim%.uv" } },
			},
		},
	},
	{
		"stevearc/conform.nvim",
		config = function()
			require("conform").setup({
				formatters_by_ft = {
					lua = { "stylua" },
					astro = { "prettier", stop_after_first = true },
					-- typescript = { "biome", "prettier", stop_after_first = true },
					-- javascript = { "biome", "prettier", stop_after_first = true },
				}
			})
		end
	},
	{ "Bilal2453/luvit-meta", lazy = true }, -- optional `vim.uv` typings
}
