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
}

local revision_cache_by_cwd = {}

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

local function log_template()
	return table.concat({
		"change_id.short()",
		'"\t"',
		"commit_id.short()",
		'"\t"',
		'bookmarks.join(" ")',
		'"\t"',
		"description.first_line()",
		'"\n"',
	}, " ++ ")
end

local function build_revision_entries(stdout)
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

	for _, line in ipairs(vim.split(stdout or "", "\n", { trimempty = true })) do
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

local function fetch_revision_entries(cwd, on_done)
	vim.system({
		"jj",
		"log",
		"--revisions",
		"all()",
		"--limit",
		tostring(REVISION_LIMIT),
		"--no-graph",
		"--template",
		log_template(),
	}, { text = true, cwd = cwd }, function(result)
		local ok, value = pcall(function()
			if result.code ~= 0 then
				error(vim.trim(result.stderr ~= "" and result.stderr or result.stdout))
			end
			return build_revision_entries(result.stdout)
		end)

		vim.schedule(function()
			on_done(ok, value)
		end)
	end)
end

local function ensure_revision_cache(cwd)
	local cache = revision_cache_by_cwd[cwd]
	if cache and (cache.state == "loading" or cache.state == "ready") then
		return cache
	end

	cache = {
		state = "loading",
		entries = nil,
		error = nil,
		waiters = {},
	}
	revision_cache_by_cwd[cwd] = cache

	fetch_revision_entries(cwd, function(ok, value)
		if ok then
			cache.state = "ready"
			cache.entries = value
			cache.error = nil
		else
			cache.state = "error"
			cache.entries = nil
			cache.error = value
		end

		local waiters = cache.waiters
		cache.waiters = {}
		for _, waiter in ipairs(waiters) do
			waiter(cache)
		end
	end)

	return cache
end

local function find_entry_index(entries, revision)
	for index, entry in ipairs(entries) do
		if entry.rev == revision then
			return index
		end
	end

	return nil
end

local function preselect_revisions(picker, entries, revisions)
	for _, revision in ipairs(revisions) do
		local index = find_entry_index(entries, revision)
		if index then
			picker:add_selection(picker:get_row(index))
		end
	end
end

local function open_revision_picker(opts)
	local picker

	picker = pickers.new({}, {
		sorting_strategy = "ascending",
		layout_config = { prompt_position = "top" },
		prompt_title = "JJ diff revisions  (<Tab> select 2, <CR> confirm)",
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
		default_selection_index = find_entry_index(opts.entries, opts.default_from) or 1,
		on_complete = {
			function(self)
				preselect_revisions(self, opts.entries, { opts.default_from, opts.default_to })
			end,
		},
		attach_mappings = function(prompt_bufnr, map)
			local function confirm_revisions()
				local current_picker = action_state.get_current_picker(prompt_bufnr)
				local selections = current_picker:get_multi_selection()

				if #selections ~= 2 then
					vim.notify("Select exactly two revisions with <Tab>", vim.log.levels.WARN)
					return
				end

				actions.close(prompt_bufnr)
				vim.schedule(function()
					opts.on_select(selections[1].value.rev, selections[2].value.rev)
				end)
			end

			map("i", "<CR>", confirm_revisions)
			map("n", "<CR>", confirm_revisions)
			return true
		end,
	})

	picker:find()
end

local function open_revisions_when_ready(prompt_bufnr, diff_opts)
	local cache = ensure_revision_cache(diff_opts.cwd)

	local function launch(entries)
		if vim.api.nvim_buf_is_valid(prompt_bufnr) then
			actions.close(prompt_bufnr)
		end
		open_revision_picker({
			entries = entries,
			default_from = diff_opts.from or DEFAULT_FROM,
			default_to = diff_opts.to or DEFAULT_TO,
			on_select = function(from_rev, to_rev)
				M.open_diff({
					cwd = diff_opts.cwd,
					from = from_rev,
					to = to_rev,
				})
			end,
		})
	end

	if cache.state == "ready" then
		launch(cache.entries)
		return
	end

	if cache.state == "error" then
		vim.notify(cache.error, vim.log.levels.ERROR)
		return
	end

	vim.notify("Loading JJ revisions…", vim.log.levels.INFO)
	table.insert(cache.waiters, function(updated_cache)
		if updated_cache.state == "ready" then
			launch(updated_cache.entries)
		else
			vim.notify(updated_cache.error, vim.log.levels.ERROR)
		end
	end)
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

	ensure_revision_cache(diff_opts.cwd)

	diff_opts.attach_mappings = function(prompt_bufnr, map)
		local function select_revisions()
			open_revisions_when_ready(prompt_bufnr, diff_opts)
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
