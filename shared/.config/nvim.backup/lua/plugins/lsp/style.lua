local M = {}

M.setup = function()
	vim.fn.sign_define("DiagnosticSignError", { text = "!", texthl = "DiagnosticSignError" })
	vim.fn.sign_define("DiagnosticSignWarn", { text = "?", texthl = "DiagnosticSignWarn" })
	vim.fn.sign_define("DiagnosticSignInfo", { text = "> ", texthl = "DiagnosticSignInfo" })
	vim.fn.sign_define("DiagnosticSignHint", { text = "~", texthl = "DiagnosticSignHint" })

	vim.diagnostic.config({
		float = {
			max_width = 65,
			max_height = 30,
			wrap = true,
			border = "rounded",
		},
		underline = { severity = vim.diagnostic.severity.ERROR },
		virtual_text = true,

		signs = {
			linehl = {
				[vim.diagnostic.severity.ERROR] = "DiagnosticLineHlError",
				[vim.diagnostic.severity.WARN] = "DiagnosticLineHlWarn",
				[vim.diagnostic.severity.INFO] = "DiagnosticLineHlInfo",
				[vim.diagnostic.severity.HINT] = "DiagnosticLineHlHint",
			},
		},
		update_in_insert = false,
		severity_sort = true,
	})

	require("lspconfig.ui.windows").default_options.border = "rounded"

	vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, {
		border = "rounded",
		max_width = 65,
		max_height = 30,
	})

	vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, {
		border = "rounded",

		max_width = 65,
		max_height = 30,
		silent = true,
		focusable = false,
	})
end
return M
