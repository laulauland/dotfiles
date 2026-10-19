-- Server binaries come from mise (shared/.config/mise/config.toml); base
-- configs come from nvim-lspconfig's lsp/*.lua. Only overrides live here.

vim.lsp.config("lua_ls", {
	settings = {
		Lua = {
			runtime = { version = "LuaJIT" },
			workspace = {
				checkThirdParty = false,
				library = { vim.env.VIMRUNTIME, "${3rd}/luv/library" },
			},
			completion = { callSnippet = "Replace" },
			telemetry = { enable = false },
		},
	},
})

vim.lsp.config("rust_analyzer", {
	settings = {
		["rust-analyzer"] = {
			cargo = { allFeatures = true },
			check = { command = "clippy" },
		},
	},
})

vim.lsp.config("jsonls", {
	settings = {
		json = {
			schemas = require("schemastore").json.schemas(),
			validate = { enable = true },
		},
	},
})

vim.lsp.config("yamlls", {
	settings = {
		yaml = {
			schemaStore = { enable = false, url = "" },
			schemas = require("schemastore").yaml.schemas(),
		},
	},
})

-- macOS has no CUDA toolkit; the install-cuda-headers mise hook provides the
-- headers so clangd can check .cu files and resolve <cuda.h>. Fallback flags
-- apply only to files without a compile_commands.json.
local cuda_headers = vim.fn.expand("~/.local/share/cuda-headers")
if vim.fn.isdirectory(cuda_headers) == 1 then
	vim.lsp.config("clangd", {
		init_options = {
			fallbackFlags = {
				"--cuda-path=" .. cuda_headers,
				"-nocudalib",
				"-Wno-unknown-cuda-version",
				"-isystem" .. cuda_headers .. "/include",
			},
		},
	})
end

-- Experimental MSL server, built by the macOS mise post-tools hook
-- (install-metal-lsp). Keep Metal away from clangd: MSL is not ordinary C++.
-- Not "metals", which is the unrelated Scala server.
vim.lsp.config("metal_lsp", {
	cmd = { vim.fn.expand("~/.local/bin/metal-lsp") },
	filetypes = { "metal" },
	root_markers = { "build.zig", "Package.swift", ".jj", ".git" },
})

-- tsc is the TypeScript 7 native server; it picks the project's
-- node_modules/.bin/tsc when that is >= 7, else the global one.
-- clangd (C, C++, Objective-C, CUDA) comes from Xcode on macOS.
local servers = { "lua_ls", "rust_analyzer", "jsonls", "yamlls", "ty", "tsc", "biome", "mojo", "zls", "clangd", "metal_lsp" }

-- Enable only servers whose binary is installed, so a host without one
-- (e.g. no Mojo) stays quiet.
vim.lsp.enable(vim.tbl_filter(function(name)
	local cmd = vim.lsp.config[name] and vim.lsp.config[name].cmd
	return type(cmd) == "function" or (type(cmd) == "table" and vim.fn.executable(cmd[1]) == 1)
end, servers))

vim.diagnostic.config({
	severity_sort = true,
	float = { source = "if_many" },
	underline = { severity = vim.diagnostic.severity.ERROR },
	virtual_text = { source = "if_many", spacing = 2 },
	signs = {
		text = {
			[vim.diagnostic.severity.ERROR] = "󰅚 ",
			[vim.diagnostic.severity.WARN] = "󰀪 ",
			[vim.diagnostic.severity.INFO] = "󰋽 ",
			[vim.diagnostic.severity.HINT] = "󰌶 ",
		},
	},
})

-- Completion: built-in autocompletion over LSP ('omnifunc') and buffer words.
-- vim.lsp.completion applies snippets, auto-imports and other side effects
-- when an item is accepted. Keys: see "Completion menu" in core/keymaps.lua.
-- Only real file buffers autocomplete; prompts, terminals and
-- other special buffers stay quiet. The delay keeps fast typing unbroken.
vim.o.autocomplete = false
vim.o.autocompletedelay = 150
vim.o.complete = "o,.^5,w^5,b^5"
vim.api.nvim_create_autocmd("BufEnter", {
	group = vim.api.nvim_create_augroup("user.autocomplete", { clear = true }),
	callback = function(args)
		vim.bo[args.buf].autocomplete = vim.bo[args.buf].buftype == "" and vim.bo[args.buf].modifiable
	end,
})

vim.api.nvim_create_autocmd("LspAttach", {
	group = vim.api.nvim_create_augroup("user.lsp", { clear = true }),
	callback = function(args)
		local client = assert(vim.lsp.get_client_by_id(args.data.client_id))
		local buf = args.buf
		local map = function(mode, lhs, rhs, desc)
			vim.keymap.set(mode, lhs, rhs, { buffer = buf, desc = desc, nowait = true })
		end
		local pick = function(picker)
			return function() require("fzf-lua")[picker]() end
		end

		map("n", "gd", pick("lsp_definitions"), "Go to definition")
		map("n", "gD", pick("lsp_typedefs"), "Go to type definition")
		map("n", "gr", pick("lsp_references"), "Go to references")
		map("n", "<F12>", pick("lsp_references"), "Go to references")
		map("n", "gi", pick("lsp_implementations"), "Go to implementation")
		map("n", "<leader>r", vim.lsp.buf.rename, "Rename symbol")
		map({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, "Code action")
		map("n", "<leader>d", vim.diagnostic.open_float, "Show diagnostic")
		-- K (hover), [d / ]d (diagnostics) and <C-s> (signature) are Nvim defaults.

		if client:supports_method("textDocument/completion") then
			-- Drop the long type/detail column: name + kind only, docs on K.
			vim.lsp.completion.enable(true, client.id, buf, {
				convert = function() return { menu = "" } end,
			})
		end

		if client:supports_method("textDocument/documentHighlight") then
			local hl = vim.api.nvim_create_augroup("user.lsp.highlight." .. buf, { clear = true })
			vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
				group = hl,
				buffer = buf,
				callback = vim.lsp.buf.document_highlight,
			})
			vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI", "LspDetach" }, {
				group = hl,
				buffer = buf,
				callback = vim.lsp.buf.clear_references,
			})
		end
	end,
})
