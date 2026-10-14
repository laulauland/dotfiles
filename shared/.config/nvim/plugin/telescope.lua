local telescope = require("telescope")
local actions = require("telescope.actions")
local actions_layout = require("telescope.actions.layout")
local builtin = require("telescope.builtin")

telescope.setup({
	defaults = {
		color_devicons = false,
		disable_devicons = true,
		path_display = { "truncate" },
		dynamic_preview_title = true,
		sorting_strategy = "descending",
		layout_strategy = "flex",
		preview = { filesize_limit = 0.1 },
		mappings = {
			i = {
				["<esc>"] = actions.close,
				["<C-CR>"] = actions.file_vsplit,
				["<M-p>"] = actions_layout.toggle_preview,
				["<C-r><C-w>"] = false,
				["<C-r><C-a>"] = false,
				["<C-r><C-f>"] = false,
				["<C-r><C-l>"] = false,
			},
			n = {
				["q"] = actions.close,
				["<M-p>"] = actions_layout.toggle_preview,
			},
		},
	},
	extensions = {
		["ui-select"] = { require("telescope.themes").get_cursor() },
	},
})
telescope.load_extension("jj")
telescope.load_extension("live_grep_args")
telescope.load_extension("ui-select")

local function project_files(opts)
	local jj_ok, jj_err = pcall(telescope.extensions.jj.files, opts)
	if jj_ok then return end
	local git_ok, git_err = pcall(builtin.git_files, opts)
	if git_ok then return end
	error("Could not launch jj/git files:\n" .. tostring(jj_err) .. "\n" .. tostring(git_err))
end

-- Telescope's commands picker feedkeys `:Name ` with no range, so a visual
-- selection is dropped. Remember the selection and prepend `'<,'>` so
-- range-aware commands (e.g. JJReview add) anchor to it.
local function command_palette()
	local range_prefix = ""
	if vim.fn.mode():match("^[vV\22]") then
		-- Leave visual so the '< and '> marks update to this selection.
		vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
		range_prefix = "'<,'>"
	end

	builtin.commands({
		attach_mappings = function(prompt_bufnr)
			actions.select_default:replace(function()
				local selection = require("telescope.actions.state").get_selected_entry()
				if not selection then return end
				actions.close(prompt_bufnr)
				local cmd = ":" .. range_prefix .. selection.value.name .. " "
				if selection.value.nargs == "0" then cmd = cmd .. vim.keycode("<CR>") end
				vim.cmd.stopinsert()
				vim.api.nvim_feedkeys(cmd, "nt", false)
			end)
			return true
		end,
	})
end

local map = vim.keymap.set
map("n", "<C-p>", builtin.find_files, { desc = "Find files" })
map("n", "<S-C-p>", command_palette, { desc = "Command palette" })
map({ "n", "x" }, "<leader><leader>", command_palette, { desc = "Command palette" })
map("n", "<leader>b", builtin.buffers, { desc = "Buffers" })
map("n", "<leader>ff", builtin.find_files, { desc = "Find files" })
map("n", "<leader>fF", function() builtin.find_files({ hidden = true }) end, { desc = "Find files (hidden)" })
map("n", "<leader>fd", function() require("core.telescope_jj").open_diff() end, { desc = "Diff vs trunk" })
map("n", "<leader>fg", project_files, { desc = "VCS files" })
map("n", "<leader>fw", telescope.extensions.live_grep_args.live_grep_args, { desc = "Live grep" })
map("n", "<leader>fh", builtin.help_tags, { desc = "Help" })
map("n", "<leader>fm", builtin.marks, { desc = "Marks" })
map("n", "<leader>fr", builtin.resume, { desc = "Resume last picker" })
map("n", "<leader>fs", builtin.lsp_dynamic_workspace_symbols, { desc = "Workspace symbols" })
