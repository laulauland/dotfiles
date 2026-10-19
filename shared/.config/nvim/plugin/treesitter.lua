-- Mojo is not in the upstream parser registry; register the community
-- grammar (tracks Mojo 1.0, ships nvim highlight queries).
vim.api.nvim_create_autocmd("User", {
	pattern = "TSUpdate",
	callback = function()
		require("nvim-treesitter.parsers").mojo = {
			install_info = {
				url = "https://github.com/dmitry-salin/tree-sitter-mojo",
				files = { "src/parser.c", "src/scanner.c" },
				branch = "main",
				queries = "nvim-queries/mojo",
			},
		}
	end,
})

-- nvim-treesitter (main branch) only installs parsers; it no longer
-- highlights or ensures parsers on its own. Install missing ones async.
local ensure = {
	"bash", "c", "cpp", "css", "cuda", "elixir", "erlang", "go", "gomod", "heex",
	"html", "javascript", "json", "lua", "luadoc", "mojo",
	"markdown", "markdown_inline", "objc", "python", "rust", "toml",
	"tsx", "typescript", "vim", "vimdoc", "yaml", "zig",
}
local installed = require("nvim-treesitter").get_installed()
local missing = vim.tbl_filter(function(lang) return not vim.tbl_contains(installed, lang) end, ensure)
if #missing > 0 then require("nvim-treesitter").install(missing) end

vim.api.nvim_create_autocmd("FileType", {
	group = vim.api.nvim_create_augroup("user.treesitter", { clear = true }),
	callback = function(args)
		if not pcall(vim.treesitter.start, args.buf) then return end
		vim.wo.foldmethod = "expr"
		vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
		vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"

		-- Incremental selection with the built-in |v_an| / |v_in|:
		-- <CR> grows the selection to the parent node, <BS> shrinks it.
		vim.keymap.set("n", "<CR>", "van", { buffer = args.buf, remap = true, desc = "Select node" })
		vim.keymap.set("x", "<CR>", "an", { buffer = args.buf, remap = true, desc = "Grow selection" })
		vim.keymap.set("x", "<BS>", "in", { buffer = args.buf, remap = true, desc = "Shrink selection" })
	end,
})

require("treesitter-context").setup({ mode = "topline", max_lines = 3 })
require("ts-comments").setup()
