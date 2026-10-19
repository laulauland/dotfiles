local group = vim.api.nvim_create_augroup("user", { clear = true })
local autocmd = function(event, opts)
	vim.api.nvim_create_autocmd(event, vim.tbl_extend("force", { group = group }, opts))
end

local function is_special_buffer()
	return vim.bo.buftype ~= "" or vim.tbl_contains({ "harpoon", "oil" }, vim.bo.filetype)
end

-- Metal Shading Language; highlighting is syntax/metal.vim (no treesitter parser).
-- .cu/.cuh are already "cuda" in Nvim.
vim.filetype.add({ extension = { metal = "metal", msl = "metal" } })

autocmd("TermOpen", {
	desc = "Terminal: no line numbers, start in insert mode",
	callback = function()
		vim.wo.number = false
		vim.wo.relativenumber = false
		vim.cmd.startinsert()
	end,
})

autocmd("BufEnter", {
	desc = "Terminal: re-enter insert mode on focus",
	pattern = "term://*",
	command = "startinsert",
})

autocmd({ "BufEnter", "WinEnter", "FocusGained", "InsertLeave" }, {
	desc = "Relative numbers only in the active window in normal mode",
	callback = function() vim.wo.relativenumber = not is_special_buffer() end,
})

autocmd({ "BufLeave", "WinLeave", "FocusLost", "InsertEnter" }, {
	desc = "Relative numbers only in the active window in normal mode",
	callback = function()
		if not is_special_buffer() then vim.wo.relativenumber = false end
	end,
})

autocmd("TextYankPost", {
	desc = "Highlight yanked text",
	callback = function() vim.hl.on_yank({ higroup = "IncSearch", timeout = 40 }) end,
})

autocmd("BufReadPost", {
	desc = "Restore last cursor position, centered",
	callback = function(args)
		local mark = vim.api.nvim_buf_get_mark(args.buf, '"')
		if mark[1] > 1 and mark[1] <= vim.api.nvim_buf_line_count(args.buf) then
			vim.api.nvim_win_set_cursor(0, mark)
			vim.cmd("normal! zz")
		end
	end,
})

autocmd("FileType", {
	desc = "Soft wrap markdown",
	pattern = "markdown",
	callback = function()
		vim.wo.wrap = true
		vim.wo.linebreak = true
	end,
})

for name, bin in pairs({ Zed = "zed", Cursor = "cursor" }) do
	vim.api.nvim_create_user_command(name, function(opts)
		vim.system(vim.list_extend({ bin }, vim.tbl_map(vim.fn.expand, opts.fargs)))
	end, { nargs = "*", complete = "file", desc = "Open in " .. name })
end

vim.api.nvim_create_user_command("Hints", function()
	vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
end, { desc = "Toggle inlay hints" })
