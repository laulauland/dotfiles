-- Plugins are managed by the built-in vim.pack (see :h vim.pack).
-- Their setup lives in plugin/*.lua. Versions are pinned in nvim-pack-lock.json.

vim.api.nvim_create_autocmd("PackChanged", {
	desc = "Update treesitter parsers when nvim-treesitter changes",
	callback = function(ev)
		if ev.data.spec.name == "nvim-treesitter" and ev.data.kind == "update" then
			if not ev.data.active then vim.cmd.packadd("nvim-treesitter") end
			vim.cmd("TSUpdate")
		end
	end,
})

local gh = function(repo) return "https://github.com/" .. repo end

vim.pack.add({
	-- UI
	gh("dchinmay2/alabaster.nvim"),
	gh("folke/which-key.nvim"),
	gh("j-hui/fidget.nvim"),
	gh("nvim-mini/mini.icons"),

	-- Treesitter
	gh("nvim-treesitter/nvim-treesitter"),
	gh("nvim-treesitter/nvim-treesitter-context"),
	gh("folke/ts-comments.nvim"),

	-- LSP and formatting
	gh("neovim/nvim-lspconfig"),
	gh("b0o/SchemaStore.nvim"),
	gh("stevearc/conform.nvim"),
	gh("supermaven-inc/supermaven-nvim"),

	-- Navigation
	gh("nvim-lua/plenary.nvim"),
	gh("nvim-telescope/telescope.nvim"),
	gh("nvim-telescope/telescope-live-grep-args.nvim"),
	gh("nvim-telescope/telescope-ui-select.nvim"),
	gh("zschreur/telescope-jj.nvim"),
	gh("stevearc/oil.nvim"),
	gh("stevearc/aerial.nvim"),
	{ src = gh("ThePrimeagen/harpoon"), version = "harpoon2" },
	gh("smart-splits-nvim/smart-splits.nvim"),

	-- Editing
	gh("nvim-mini/mini.pairs"),
	{ src = gh("kylechui/nvim-surround"), version = vim.version.range("*") },

	-- VCS
	gh("lewis6991/gitsigns.nvim"),
	gh("jceb/jiejie.nvim"),

	-- Markdown
	gh("dominic-righthere/markdown-pipetable.nvim"),
	gh("sotte/presenting.nvim"),
}, { confirm = false })

vim.cmd.packadd("nvim.undotree")

vim.api.nvim_create_user_command("PackUpdate", function(opts)
	vim.pack.update(#opts.fargs > 0 and opts.fargs or nil)
end, {
	nargs = "*",
	complete = function() return vim.tbl_map(function(p) return p.spec.name end, vim.pack.get()) end,
	desc = "Update plugins (all, or the named ones)",
})

vim.api.nvim_create_user_command("PackClean", function()
	local stale = vim.iter(vim.pack.get())
		:filter(function(p) return not p.active end)
		:map(function(p) return p.spec.name end)
		:totable()
	if #stale == 0 then return vim.notify("No unused plugins") end
	vim.pack.del(stale)
	vim.notify("Removed: " .. table.concat(stale, ", "))
end, { desc = "Delete plugins that are no longer in the config" })
