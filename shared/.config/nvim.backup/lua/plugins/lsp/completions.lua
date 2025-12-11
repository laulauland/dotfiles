local M = {}
local cmp = require('cmp')
local luasnip = require("luasnip")
local cmp_lsp = require("cmp_nvim_lsp")


M.capabilities = function()
	return vim.tbl_deep_extend(
		"force",
		{},
		vim.lsp.protocol.make_client_capabilities(),
		cmp_lsp.default_capabilities())
		-- require("blink.cmp").get_lsp_capabilities())
end

M.setup = function()
	luasnip.config.setup({ enable_autosnippets = true })
	luasnip.filetype_extend("typescript", { "tsdoc" })
	luasnip.filetype_extend("javascript", { "jsdoc" })


	cmp.setup({
		snippet = {
			expand = function(args)
				require('luasnip').lsp_expand(args.body) -- For `luasnip` users.
			end,
		},
		preselect = cmp.PreselectMode.None,
		mapping = cmp.mapping.preset.insert({
			['<C-Space>'] = cmp.mapping.complete(),
			["<C-u>"] = cmp.mapping(cmp.mapping.scroll_docs(-1), { "i", "c" }),
			["<C-d>"] = cmp.mapping(cmp.mapping.scroll_docs(1), { "i", "c" }),
			["<C-f>"] = cmp.mapping({
				i = cmp.config.close,
				c = cmp.mapping.close(),
			}),
			["<CR>"] = cmp.mapping({
				i = function(fallback)
					if cmp.visible() and cmp.get_active_entry() then
						cmp.confirm({
							behavior = cmp.ConfirmBehavior.Replace,
							select = false,
						})
					else
						fallback()
					end
				end,
				s = cmp.mapping.confirm({ select = true }),
				c = cmp.mapping.confirm({
					behavior = cmp.ConfirmBehavior.Replace,
					select = true,
				}),
			}),
			["<C-j>"] = cmp.mapping(function(fallback)
				if luasnip.jumpable(1) then
					luasnip.jump(1)
				else
					fallback()
				end
			end, {
				"i",
				"s",
			}),
			["<C-k>"] = cmp.mapping(function(fallback)
				if luasnip.jumpable(-1) then
					luasnip.jump(-1)
				else
					fallback()
				end
			end, {
				"i",
				"s",
			}),
		}),
		filetype_extend = {
			javascript = { "javascriptreact" },
			typescript = { "typescriptreact" },
		},
		sources = cmp.config.sources({
			{ name = "nvim_lsp" },
			{ name = "luasnip",                max_item_count = 3 },
			{ name = "path" },
			{ name = "buffer",                 max_item_count = 3 },
			{ name = "nvim_lsp_signature_help" },
			{ name = "lazydev",                group_index = 0 },
		})
	})

	require("luasnip.loaders.from_vscode").lazy_load()
	require("luasnip.loaders.from_vscode").lazy_load({ paths = { "./snippets" } })
end

return M
