local map = vim.keymap.set

-- Movement
map({ "n", "v" }, "gh", "^", { desc = "Go to first non-blank char" })
map({ "n", "v" }, "gl", "$", { desc = "Go to end of line" })
-- Center the viewport after vertical jumps
for _, key in ipairs({ "<C-d>", "<C-u>", "<C-i>", "<C-o>", "{", "}", "#", "%", "*", "gg", "G" }) do
	map("n", key, key .. "zz")
end
map("n", "n", "nzzzv")
map("n", "N", "Nzzzv")
map("n", "J", "mzJ`z")

-- Registers: change/substitute never clobber the yank register, paste over
-- a selection keeps the yanked text
map({ "n", "x" }, "c", '"_c')
map({ "n", "x" }, "s", '"_s')
map("x", "p", "P")
map("x", "P", "p")

-- Editing
map("v", "J", ":m '>+1<CR>gv=gv", { desc = "Move selection down" })
map("v", "K", ":m '<-2<CR>gv=gv", { desc = "Move selection up" })
map("v", "<", "<gv")
map("v", ">", ">gv")
map("v", "-", "<C-x>", { desc = "Decrement number" })
map("v", "+", "<C-a>", { desc = "Increment number" })
map("n", "<leader>/", "gcc", { remap = true, desc = "Toggle comment line" })
map("v", "<leader>/", "gc", { remap = true, desc = "Toggle comment" })
map("n", "S", ":%s/<C-r><C-w>/<C-r><C-w>/gI<Left><Left><Left>", { desc = "Replace word under cursor" })

-- Buffers, windows, tabs, quickfix
map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save" })
map("n", "<leader>x", "<cmd>bdelete<CR>", { desc = "Kill buffer" })
map("n", "<leader>q", "<cmd>q<CR>", { desc = "Quit" })
map("n", "<leader>Q", "<cmd>qa<CR>", { desc = "Quit all" })
map({ "n", "t" }, "<C-q>", "<cmd>q<CR>", { desc = "Quit" })
map("n", "<C-Tab>", "<C-^>", { desc = "Alternate buffer" })
map("n", "<leader>v", "<cmd>vsplit<CR>", { desc = "Split vertically" })
map("n", "<leader>h", "<cmd>split<CR>", { desc = "Split horizontally" })
map("n", "<leader>=", "<C-w>=", { desc = "Equalize splits" })
map("n", "<leader>J", "<cmd>cnext<CR>", { desc = "Next quickfix item" })
map("n", "<leader>K", "<cmd>cprev<CR>", { desc = "Previous quickfix item" })
map("n", "<leader>co", "<cmd>copen<CR>", { desc = "Open quickfix list" })
map("n", "<leader>cc", "<cmd>cclose<CR>", { desc = "Close quickfix list" })
map("n", "<Esc>", "<cmd>nohlsearch<CR><Esc>", { desc = "Clear search highlight" })

-- Toggles
map("n", "<leader>uw", function()
	vim.g.whitespace = not vim.g.whitespace
	vim.opt.listchars = vim.g.whitespace and { tab = "  ", trail = "·" }
		or { tab = "› ", eol = "¬", extends = "⟩", precedes = "⟨", trail = "·", space = "·", nbsp = "⋅" }
end, { desc = "Toggle whitespace" })
map("n", "<leader>uh", function()
	vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
end, { desc = "Toggle inlay hints" })
map("n", "<leader>u", "<cmd>Undotree<CR>", { desc = "Undo tree" })

-- Insert mode: readline-style motions
map("i", "<C-a>", "<C-o>I")
map("i", "<C-e>", "<C-o>A")
map("i", "<C-b>", "<Left>")
map("i", "<C-f>", "<Right>")
map("i", "<C-p>", "<C-o>k")
map("i", "<C-n>", "<C-o>j")
map("i", "<C-j>", "<Nop>")
map("i", "<C-k>", vim.lsp.buf.signature_help, { desc = "Signature help" })
map("c", "<C-a>", "<Home>")
map("c", "<C-b>", "<Left>")
map("c", "<C-f>", "<Right>")

-- Completion menu: <Tab>/<S-Tab> cycle items (or jump snippet fields),
-- <CR> accepts the selected item
local function tab(key, dir, menu_key)
	return function()
		if vim.fn.pumvisible() == 1 then return menu_key end
		if vim.snippet.active({ direction = dir }) then
			return "<Cmd>lua vim.snippet.jump(" .. dir .. ")<CR>"
		end
		return key
	end
end
map({ "i", "s" }, "<Tab>", tab("<Tab>", 1, "<C-n>"), { expr = true })
map({ "i", "s" }, "<S-Tab>", tab("<S-Tab>", -1, "<C-p>"), { expr = true })
map("i", "<CR>", function()
	if vim.fn.pumvisible() == 1 and vim.fn.complete_info({ "selected" }).selected ~= -1 then
		return vim.keycode("<C-y>")
	end
	return MiniPairs and MiniPairs.cr() or vim.keycode("<CR>")
end, { expr = true, replace_keycodes = false, desc = "Accept completion or newline" })

-- Terminal
map("t", "<Esc><Esc>", "<C-\\><C-n>")
map("t", "<C-d>", "<C-\\><C-n><C-d>zzA")
map("t", "<C-u>", "<C-\\><C-n><C-u>zzA")
map("t", "<C-i>", "<C-\\><C-n><C-i>zz")
map("t", "<C-o>", "<C-\\><C-n><C-o>zz")
map("t", "<Tab>", "<Tab>")
map("t", "<C-^>", "<C-\\><C-n><C-^>")
map("t", "<C-Tab>", "<C-\\><C-n><C-^>")
