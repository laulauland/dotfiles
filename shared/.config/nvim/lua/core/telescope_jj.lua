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
local LOADING_ENTRY = {
	rev = "__loading__",
	label = "Loading revisions…",
	ordinal = "",
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
		'bookmarks.join(" ")',
		'"\t"',
		"description.first_line()",
		'"\n"',
	}, " ++ ")
end

local function resolve_template()
	return 'change_id.short() ++ "\n"'
end

local function build_revision_entries(stdout)
	local entries = {}
	local seen = {}

	local function add_entry(entry)
		if entry.rev == "" or seen[entry.rev] then
			return
		end
		seen[entry.rev] = true
		entries[#entries + 1] = entry
	end

	for _, line in ipairs(vim.split(stdout or "", "\n", { trimempty = true })) do
		local fields = vim.split(line, "\t", { plain = true, trimempty = false })
		local change_id = fields[1] or ""
		local bookmarks = fields[2] or ""
		local description = fields[3] or ""
		local label = table.concat(vim.tbl_filter(function(part)
			return part ~= ""
		end, {
			change_id,
			bookmarks,
			description ~= "" and description or "(no description)",
		}), "  ")

		add_entry({
			rev = change_id,
			label = label,
			ordinal = table.concat({ change_id, bookmarks, description }, " "),
		})
	end

	return entries
end

local function fetch_revision_entries(cwd, on_done)
	vim.system({
		"jj",
		"log",
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

local function resolve_revision(cwd, revision, on_done)
	vim.system({
		"jj",
		"log",
		"--revisions",
		revision,
		"--limit",
		"1",
		"--no-graph",
		"--template",
		resolve_template(),
	}, { text = true, cwd = cwd }, function(result)
		local ok, value = pcall(function()
			if result.code ~= 0 then
				error(vim.trim(result.stderr ~= "" and result.stderr or result.stdout))
			end
			return vim.trim(result.stdout)
		end)

		vim.schedule(function()
			on_done(ok, value)
		end)
	end)
end

local function finish_cache_request(cache)
	cache.pending = cache.pending - 1
	if cache.pending > 0 then
		return
	end

	if cache.entries then
		if not cache.resolved[DEFAULT_TO] and cache.entries[1] then
			cache.resolved[DEFAULT_TO] = cache.entries[1].rev
		end
		cache.state = "ready"
	else
		cache.state = "error"
		cache.error = cache.error or "Could not load JJ revisions"
	end

	local waiters = cache.waiters
	cache.waiters = {}
	for _, waiter in ipairs(waiters) do
		waiter(cache)
	end
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
		resolved = {},
		waiters = {},
		pending = 2,
	}
	revision_cache_by_cwd[cwd] = cache

	fetch_revision_entries(cwd, function(ok, value)
		if ok then
			cache.entries = value
		else
			cache.error = value
		end
		finish_cache_request(cache)
	end)

	resolve_revision(cwd, DEFAULT_FROM, function(ok, value)
		if ok and value ~= "" then
			cache.resolved[DEFAULT_FROM] = value
		end
		finish_cache_request(cache)
	end)

	return cache
end

local function resolved_revision(cache, revision)
	if cache and cache.resolved[revision] then
		return cache.resolved[revision]
	end
	return revision
end

local function find_entry_index(entries, revision)
	for index, entry in ipairs(entries) do
		if entry.rev == revision then
			return index
		end
	end

	return nil
end

local function preselect_revisions(picker, entries, cache, revisions)
	for _, revision in ipairs(revisions) do
		local resolved = resolved_revision(cache, revision)
		local index = find_entry_index(entries, resolved)
		if index then
			picker:add_selection(picker:get_row(index))
		end
	end
end

local function revision_entry_maker(entry)
	return {
		value = entry,
		display = entry.label,
		ordinal = entry.ordinal,
	}
end

local function open_revision_picker(diff_opts)
	local cache = ensure_revision_cache(diff_opts.cwd)
	local state = {
		loading = cache.state ~= "ready",
		preselected = false,
	}

	local picker = pickers.new({}, {
		sorting_strategy = "ascending",
		layout_config = { prompt_position = "top" },
		prompt_title = "JJ revisions",
		finder = finders.new_table({
			results = cache.entries or { LOADING_ENTRY },
			entry_maker = revision_entry_maker,
		}),
		sorter = conf.generic_sorter({}),
		default_selection_index = find_entry_index(cache.entries or {}, resolved_revision(cache, diff_opts.to or DEFAULT_TO)) or 1,
		on_complete = {
			function(self)
				if state.loading or state.preselected or not cache.entries then
					return
				end
				preselect_revisions(self, cache.entries, cache, {
					diff_opts.from or DEFAULT_FROM,
					diff_opts.to or DEFAULT_TO,
				})
				state.preselected = true
			end,
		},
		attach_mappings = function(prompt_bufnr, map)
			local function confirm_revisions()
				if state.loading then
					return
				end

				local current_picker = action_state.get_current_picker(prompt_bufnr)
				local selections = current_picker:get_multi_selection()
				if #selections ~= 2 then
					vim.notify("Select exactly two revisions with <Tab>", vim.log.levels.WARN)
					return
				end

				actions.close(prompt_bufnr)
				vim.schedule(function()
					M.open_diff({
						cwd = diff_opts.cwd,
						from = selections[1].value.rev,
						to = selections[2].value.rev,
					})
				end)
			end

			map("i", "<CR>", confirm_revisions)
			map("n", "<CR>", confirm_revisions)
			return true
		end,
	})

	picker:find()

	if cache.state == "loading" then
		table.insert(cache.waiters, function(updated_cache)
			if not vim.api.nvim_buf_is_valid(picker.prompt_bufnr) then
				return
			end

			state.loading = false
			state.preselected = false
			if updated_cache.state ~= "ready" then
				vim.notify(updated_cache.error, vim.log.levels.ERROR)
				return
			end

			picker.default_selection_index = find_entry_index(
				updated_cache.entries,
				resolved_revision(updated_cache, diff_opts.to or DEFAULT_TO)
			) or 1
			picker:refresh(finders.new_table({
				results = updated_cache.entries,
				entry_maker = revision_entry_maker,
			}), { reset_prompt = false })
		end)
	end
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
			actions.close(prompt_bufnr)
			vim.schedule(function()
				open_revision_picker(diff_opts)
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
