local map = vim.keymap.set

-- Oil: file explorer
vim.api.nvim_set_hl(0, "OilTestFile", { link = "Comment" })
local function is_test_file(name)
	return name:match("[._%-]test%.") or name:match("[._%-]spec%.")
end
require("oil").setup({
	skip_confirm_for_simple_edits = true,
	columns = { "size", "permissions", "mtime" },
	watch_for_changes = true,
	constrain_cursor = "name",
	view_options = {
		show_hidden = true,
		natural_order = true,
		highlight_filename = function(entry)
			if entry.type == "file" and is_test_file(entry.name) then return "OilTestFile" end
		end,
	},
	use_default_keymaps = false,
	keymaps = {
		["g?"] = "actions.show_help",
		["<CR>"] = "actions.select",
		["<C-CR>"] = "actions.select_vsplit",
		["<C-p>"] = "actions.preview",
		["<leader>"] = "actions.refresh",
		["-"] = "actions.parent",
		["<BS>"] = "actions.parent",
		["_"] = "actions.open_cwd",
		["`"] = "actions.cd",
		["."] = "actions.cd",
		["~"] = "actions.tcd",
		["go"] = "actions.open_external",
		["g."] = "actions.toggle_hidden",
	},
})
map("n", "-", "<cmd>Oil<CR>", { desc = "Open parent directory" })
map("n", "<leader>e", "<cmd>Oil<CR>", { desc = "Open parent directory" })

-- Aerial: document symbols
require("aerial").setup({
	show_guides = true,
	backends = { "lsp", "treesitter", "markdown", "man" },
	highlight_on_hover = true,
	close_on_select = true,
	filter_kind = { "Class", "Constructor", "Enum", "Function", "Interface", "Module", "Method", "Struct", "Variable" },
	close_automatic_events = { "unfocus", "switch_buffer", "unsupported" },
	keymaps = {
		["<esc>"] = "actions.close",
		["<C-n>"] = "actions.down_and_scroll",
		["<C-p>"] = "actions.up_and_scroll",
	},
})
map("n", "gs", function() require("aerial").toggle() end, { desc = "Document symbols" })
map("n", "gS", function()
	-- Workaround for https://github.com/stevearc/aerial.nvim/issues/331
	require("aerial").refetch_symbols()
	vim.cmd.AerialToggle("float")
	vim.cmd.doautocmd("BufWinEnter")
end, { desc = "Search document symbols" })

-- Harpoon: pinned files
local harpoon = require("harpoon")
harpoon:setup({ settings = { save_on_toggle = true } })
harpoon:extend({
	UI_CREATE = function(ctx)
		map("n", "<C-CR>", function() harpoon.ui:select_menu_item({ vsplit = true }) end, { buffer = ctx.bufnr })
		map("n", "<C-t>", function() harpoon.ui:select_menu_item({ tabedit = true }) end, { buffer = ctx.bufnr })
	end,
})
local harpoon_menu = function() harpoon.ui:toggle_quick_menu(harpoon:list()) end
map("n", "<C-e>", harpoon_menu, { desc = "Harpoon menu" })
map("n", "<leader>fa", harpoon_menu, { desc = "Harpoon menu" })
map("n", "<leader>a", function() harpoon:list():add() end, { desc = "Add to Harpoon" })
for i = 1, 4 do
	map("n", "<leader>" .. i, function() harpoon:list():select(i) end, { desc = "Harpoon " .. i })
end

-- Smart splits: move between nvim and tmux/Rex panes with <C-hjkl>
local splits = require("smart-splits")
-- Rex has no smart-splits backend: at the nvim edge, hand focus back to Rex
-- (its init.lua passes <C-hjkl> through to nvim).
local function at_edge(ctx)
	if vim.env.REX_SESSION and vim.env.REX_SESSION ~= "" and not ctx.backend then
		vim.system({ vim.env.REX_BIN_PATH or "rex", "focus", ctx.direction, "-s", vim.env.REX_SESSION })
	else
		ctx.wrap()
	end
end
splits.setup({
	-- Inside a tmux popup the outer TMUX_PANE points at a pane the popup server
	-- can't address, so the multiplexer integration errors on every edge move.
	multiplexer_integration = vim.env.NVIM_IN_TMUX_POPUP == "1" and false or nil,
	move = { at_edge = at_edge },
})
map({ "n", "v", "t" }, "<C-h>", splits.move_cursor_left, { desc = "Move to left split" })
map({ "n", "v", "t" }, "<C-j>", splits.move_cursor_down, { desc = "Move to below split" })
map({ "n", "v", "t" }, "<C-k>", splits.move_cursor_up, { desc = "Move to above split" })
map({ "n", "v", "t" }, "<C-l>", splits.move_cursor_right, { desc = "Move to right split" })
map({ "n", "v" }, "<Left>", splits.resize_left, { desc = "Resize left" })
map({ "n", "v" }, "<Down>", splits.resize_down, { desc = "Resize down" })
map({ "n", "v" }, "<Up>", splits.resize_up, { desc = "Resize up" })
map({ "n", "v" }, "<Right>", splits.resize_right, { desc = "Resize right" })
