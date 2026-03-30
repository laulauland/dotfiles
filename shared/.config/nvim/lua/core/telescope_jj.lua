local M = {}

local actions = require("telescope.actions")
local action_state = require("telescope.actions.state")
local conf = require("telescope.config").values
local finders = require("telescope.finders")
local pickers = require("telescope.pickers")
local telescope = require("telescope")

local DEFAULT_FROM = "trunk()"
local DEFAULT_TO = "@"
local REVISION_LIMIT = 200

local shortcut_revisions = {
	{ rev = DEFAULT_FROM, label = "trunk()  repo trunk" },
	{ rev = DEFAULT_TO, label = "@        working copy" },
	{ rev = "@-", label = "@-       previous change" },
}

local function jj_root(cwd)
	if cwd then
		return cwd
	end

	local ok, utils = pcall(require, "telescope-jj.utils")
	if not ok then
		return nil, "Could not load telescope-jj utils"
	end

	local root_ok, root = pcall(utils.get_jj_root)
	if not root_ok then
		return nil, root
	end

	return root
end

local function run_jj(cwd, args)
	local result = vim.system(vim.list_extend({ "jj" }, args), { text = true, cwd = cwd }):wait()
	if result.code ~= 0 then
		error(vim.trim(result.stderr ~= "" and result.stderr or result.stdout))
	end

	return vim.split(result.stdout, "\n", { trimempty = true })
end

local function revision_entries(cwd)
	local entries = {}
	local seen = {}

	local function add_entry(entry)
		if seen[entry.rev] then
			return
		end
		seen[entry.rev] = true
		entries[#entries + 1] = entry
	end

	for _, shortcut in ipairs(shortcut_revisions) do
		add_entry({
			rev = shortcut.rev,
			label = shortcut.label,
			ordinal = shortcut.rev .. " " .. shortcut.label,
		})
	end

	local template = table.concat({
		"change_id.short()",
		'"\t"',
		"commit_id.short()",
		'"\t"',
		'bookmarks.join(" ")',
		'"\t"',
		"description.first_line()",
		'"\n"',
	}, " ++ ")

	for _, line in ipairs(run_jj(cwd, {
		"log",
		"--revisions",
		"all()",
		"--limit",
		tostring(REVISION_LIMIT),
		"--no-graph",
		"--template",
		template,
	})) do
		local fields = vim.split(line, "\t", { plain = true, trimempty = false })
		local change_id = fields[1] or ""
		local commit_id = fields[2] or ""
		local bookmarks = fields[3] or ""
		local description = fields[4] or ""
		local label = table.concat(vim.tbl_filter(function(part)
			return part ~= ""
		end, {
			change_id,
			commit_id,
			bookmarks,
			description ~= "" and description or "(no description)",
		}), "  ")

		add_entry({
			rev = change_id,
			label = label,
			ordinal = table.concat({ change_id, commit_id, bookmarks, description }, " "),
		})
	end

	return entries
end

local function default_selection_index(entries, default_rev)
	for index, entry in ipairs(entries) do
		if entry.rev == default_rev then
			return index
		end
	end

	return 1
end

local function open_revision_picker(opts)
	pickers
		.new({}, {
			sorting_strategy = "ascending",
			layout_config = { prompt_position = "top" },
			prompt_title = opts.prompt_title,
			finder = finders.new_table({
				results = opts.entries,
				entry_maker = function(entry)
					return {
						value = entry,
						display = entry.label,
						ordinal = entry.ordinal,
					}
				end,
			}),
			sorter = conf.generic_sorter({}),
			default_selection_index = default_selection_index(opts.entries, opts.default_rev),
			attach_mappings = function(prompt_bufnr, map)
				local function select_revision()
					local selection = action_state.get_selected_entry()
					actions.close(prompt_bufnr)
					if not selection then
						return
					end

					vim.schedule(function()
						opts.on_select(selection.value.rev)
					end)
				end

				map("i", "<CR>", select_revision)
				map("n", "<CR>", select_revision)
				return true
			end,
		})
		:find()
end

local function with_revision_picker(diff_opts, entries)
	local current_from = diff_opts.from or DEFAULT_FROM
	local current_to = diff_opts.to or DEFAULT_TO

	open_revision_picker({
		entries = entries,
		prompt_title = "JJ diff base (default: " .. current_from .. ")",
		default_rev = current_from,
		on_select = function(from_rev)
			open_revision_picker({
				entries = entries,
				prompt_title = "JJ diff target (default: " .. current_to .. ")",
				default_rev = current_to,
				on_select = function(to_rev)
					M.open_diff({
						cwd = diff_opts.cwd,
						from = from_rev,
						to = to_rev,
					})
				end,
			})
		end,
	})
end

function M.open_diff(opts)
	opts = opts or {}

	local cwd, root_err = jj_root(opts.cwd)
	if not cwd then
		vim.notify(root_err, vim.log.levels.ERROR)
		return
	end

	local diff_opts = vim.tbl_extend("force", {
		cwd = cwd,
		from = DEFAULT_FROM,
		to = DEFAULT_TO,
	}, opts)

	local cached_revision_entries = nil

	diff_opts.attach_mappings = function(prompt_bufnr, map)
		local function select_revisions()
			if not cached_revision_entries then
				local ok, entries = pcall(revision_entries, diff_opts.cwd)
				if not ok then
					vim.notify(entries, vim.log.levels.ERROR)
					return
				end
				cached_revision_entries = entries
			end

			actions.close(prompt_bufnr)
			vim.schedule(function()
				with_revision_picker(diff_opts, cached_revision_entries)
			end)
		end

		map("i", "<C-r>", select_revisions)
		map("n", "<C-r>", select_revisions)
		return true
	end

	local ok, err = pcall(function()
		telescope.extensions.jj.diff(diff_opts)
	end)
	if not ok then
		vim.notify(err, vim.log.levels.ERROR)
	end
end

return M
