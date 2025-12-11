local M = {}

M.setup = function()
	local set_keymaps = require("utils").set_keymaps

	set_keymaps({
		n = {
			["K"] = { function() vim.lsp.buf.hover() end, desc = "Hover documentation", },
			["<leader>d"] = { function() vim.diagnostic.open_float() end, desc = "Hover diagnostics", },
			["]d"] = {
				function() vim.diagnostic.goto_next() end,
				desc = "Go to next diagnostic",
			},
			["[d"] = {
				function() vim.diagnostic.goto_prev() end,
				desc = "Go to next diagnostic",
			},

			["<leader>ca"] = { function() vim.lsp.buf.code_action() end, desc = "LSP: code action",
			},

			["<C-.>"] = { function() vim.lsp.buf.code_action() end, desc = "LSP: code action" },

			["<leader>F"] = {
				function() require("conform").format({ async = true, lsp_format = "fallback" }) end,
				-- function() vim.lsp.buf.format() end,
				desc = "Format code",
			},
			["<leader>r"] = {
				function() vim.lsp.buf.rename() end,
				desc = "Rename current symbol",
			},

			["gd"] = {
				function()
					vim.lsp.buf.definition()
					vim.cmd("normal! zz")
				end,
				desc = "Show the definition of current symbol",
			},
			["<leader>gd"] = {
				":vsplit | lua require('telescope.builtin').lsp_definitions()<CR> | zz",
				desc = "Show definition in a vertical split",
			},
			["gt"] = {
				function() vim.lsp.buf.type_definition() end,
				desc = "Find all references of the current symbol",
			},
			["<leader>gt"] = {
				":vsplit | lua function() vim.lsp.buf.type_definition() vim.cmd('normal! zz') end <CR> | zz",
				desc = "Show definition in a vertical split",
			},
			["gr"] = {
				"<cmd>Telescope lsp_references<CR>",
				desc = "Find all references of the current symbol",
			},
			["gD"] = {
				function() vim.lsp.buf.implementation() end,
				desc = "Find all references of the current symbol",
			},
			["<leader>gD"] = {
				":vsplit | lua vim.lsp.buf.implementation()<CR>zz",
				desc = "Find all references of the current symbol",
			},
			["gi"] = {
				function() require("telescope.builtin").lsp_implementations() end,
				desc = "Implementation of current symbol",
			},
		}

	})
end

return M
