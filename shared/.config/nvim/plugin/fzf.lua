local fzf = require("fzf-lua")
local actions = fzf.actions

-- Text after ` -- ` in live grep: flags (`-tlua`, `-w`) go to rg as-is,
-- everything else is a glob (`*.md`, `!test/**`).
local function rg_args(query, opts)
	local search, rest = query:match("(.*)" .. opts.glob_separator .. "(.*)")
	local args = {}
	for _, s in ipairs(vim.split(rest or "", "%s+", { trimempty = true })) do
		local arg = s:sub(1, 1) == "-" and s or "--iglob=" .. s
		table.insert(args, vim.fn.shellescape(arg))
	end
	return search or query, table.concat(args, " ")
end

fzf.setup({
	"telescope",
	defaults = { file_icons = false },
	winopts = { preview = { delay = 30 } },
	previewers = { builtin = { limit_b = 100 * 1024 } },
	keymap = {
		builtin = { true, ["<M-p>"] = "toggle-preview" },
		fzf = { true, ["alt-p"] = "toggle-preview" },
	},
	files = { hidden = false },
	grep = { rg_glob = true, rg_glob_fn = rg_args },
	commands = { include_builtin = false },
})
fzf.register_ui_select()

local function project_files()
	if not pcall(require("core.fzf_jj").files) then fzf.git_files() end
end

-- Pick a user command and put `:Name ` on the command line. From visual
-- mode, prepend `'<,'>` so range-aware commands (e.g. JJReview add) anchor
-- to the selection. Commands without arguments run at once.
local function command_palette()
	local range_prefix = ""
	if vim.fn.mode():match("^[vV\22]") then
		-- Leave visual so the '< and '> marks update to this selection.
		vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
		range_prefix = "'<,'>"
	end

	fzf.commands({
		actions = {
			enter = function(selected)
				local name = selected[1]
				if not name then return end
				local def = vim.api.nvim_get_commands({})[name] or vim.api.nvim_buf_get_commands(0, {})[name]
				local cmd = ":" .. range_prefix .. name .. " "
				if def and def.nargs == "0" then cmd = cmd .. vim.keycode("<CR>") end
				vim.cmd.stopinsert()
				vim.api.nvim_feedkeys(cmd, "nt", false)
			end,
		},
	})
end

local map = vim.keymap.set
map("n", "<C-p>", fzf.files, { desc = "Find files" })
map("n", "<S-C-p>", command_palette, { desc = "Command palette" })
map({ "n", "x" }, "<leader><leader>", command_palette, { desc = "Command palette" })
map("n", "<leader>b", fzf.buffers, { desc = "Buffers" })
map("n", "<leader>ff", fzf.files, { desc = "Find files" })
map("n", "<leader>fF", function() fzf.files({ hidden = true }) end, { desc = "Find files (hidden)" })
map("n", "<leader>fd", function() require("core.fzf_jj").open_diff() end, { desc = "Diff vs trunk" })
map("n", "<leader>fg", project_files, { desc = "VCS files" })
map("n", "<leader>fw", fzf.live_grep, { desc = "Live grep (args after ' -- ')" })
map("n", "<leader>fh", fzf.helptags, { desc = "Help" })
map("n", "<leader>fm", fzf.marks, { desc = "Marks" })
map("n", "<leader>fr", fzf.resume, { desc = "Resume last picker" })
map("n", "<leader>fs", fzf.lsp_live_workspace_symbols, { desc = "Workspace symbols" })
