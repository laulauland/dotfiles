local M = {}

local action_state = require("telescope.actions.state")
local conf = require("telescope.config").values
local finders = require("telescope.finders")
local make_entry = require("telescope.make_entry")
local pickers = require("telescope.pickers")
local previewers = require("telescope.previewers")

local DEFAULT_FROM = "trunk()"
local DEFAULT_TO = "@"
local STACK_REVSET = "trunk()::@"
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

local function run_jj(cwd, args)
	local result = vim.system(vim.list_extend({ "jj" }, args), { text = true, cwd = cwd }):wait()
	if result.code ~= 0 then
		error(vim.trim(result.stderr ~= "" and result.stderr or result.stdout))
	end
	return result.stdout
end

local function append_diff_args(cmd, opts)
	if opts.revision then
		vim.list_extend(cmd, { "-r", opts.revision })
		return
	end

	if opts.from then
		vim.list_extend(cmd, { "--from", opts.from })
	end
	if opts.to then
		vim.list_extend(cmd, { "--to", opts.to })
	end
end

local function diff_prompt_title(opts)
	if opts.revision then
		return "Jujutsu Diff (" .. opts.revision .. ")"
	end

	local from_str = opts.from or "@"
	local to_str = opts.to or "@"
	return "Jujutsu Diff (" .. from_str .. " → " .. to_str .. ")"
end

local function diff_files(opts)
	local cmd = { "jj", "diff", "--name-only", "--no-pager" }
	append_diff_args(cmd, opts)
	return vim.split(run_jj(opts.cwd, vim.list_slice(cmd, 2)), "\n", { trimempty = true })
end

local function diff_previewer(opts)
	return previewers.new_termopen_previewer({
		title = "Difftastic Preview",
		cwd = opts.cwd,
		get_command = function(entry)
			local cmd = { "jj", "diff", "--no-pager" }
			if vim.fn.executable("difft") == 1 then
				vim.list_extend(cmd, { "--tool", "difft", "--color=always" })
			else
				table.insert(cmd, "--git")
			end
			append_diff_args(cmd, opts)
			vim.list_extend(cmd, { "--", entry.value })
			return cmd
		end,
	})
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
		"--revisions",
		STACK_REVSET,
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
		pending = 3,
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

	resolve_revision(cwd, DEFAULT_TO, function(ok, value)
		if ok and value ~= "" then
			cache.resolved[DEFAULT_TO] = value
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

local function selection_roles_for_revisions(revisions)
	local roles = {}
	if revisions[1] then
		roles[revisions[1]] = "FROM"
	end
	if revisions[2] then
		roles[revisions[2]] = "TO"
	end
	return roles
end

local function selected_revisions_from_picker(picker)
	local revisions = {}
	for _, selection in ipairs(picker:get_multi_selection()) do
		revisions[#revisions + 1] = selection.value.rev
	end
	return revisions
end

local function revision_finder(entries, revisions)
	local roles = selection_roles_for_revisions(revisions or {})
	return finders.new_table({
		results = entries,
		entry_maker = function(entry)
			local role = roles[entry.rev]
			local prefix = role and string.format("%-4s  ", role) or "      "
			return {
				value = entry,
				display = prefix .. entry.label,
				ordinal = entry.ordinal,
			}
		end,
	})
end

local function refresh_revision_picker(picker, entries, revisions)
	revisions = revisions or selected_revisions_from_picker(picker)
	local selection_row = picker:get_selection_row()
	picker:refresh(revision_finder(entries, revisions), { reset_prompt = false })
	for _, revision in ipairs(revisions) do
		local index = find_entry_index(entries, revision)
		if index then
			picker:add_selection(picker:get_row(index))
		end
	end
	if selection_row ~= nil then
		picker:set_selection(selection_row)
	end
end

local function default_revision_pair(cache, diff_opts)
	return {
		resolved_revision(cache, diff_opts.from or DEFAULT_FROM),
		resolved_revision(cache, diff_opts.to or DEFAULT_TO),
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
		prompt_title = "JJ revisions  (<Tab>: first=FROM, second=TO)",
		finder = revision_finder(cache.entries or { LOADING_ENTRY }),
		sorter = conf.generic_sorter({}),
		default_selection_index = find_entry_index(
			cache.entries or {},
			resolved_revision(cache, diff_opts.to or DEFAULT_TO)
		) or 1,
		on_complete = {
			function(self)
				if state.loading or state.preselected or not cache.entries then
					return
				end
				state.preselected = true
				refresh_revision_picker(self, cache.entries, default_revision_pair(cache, diff_opts))
			end,
		},
		attach_mappings = function(prompt_bufnr, map)
			local function toggle_revision_selection()
				if state.loading or not cache.entries then
					return
				end

				local current_picker = action_state.get_current_picker(prompt_bufnr)
				local entry = action_state.get_selected_entry()
				if not entry then
					return
				end

				local revisions = selected_revisions_from_picker(current_picker)
				local already_selected = current_picker._multi:is_selected(entry)
				if not already_selected and #revisions >= 2 then
					vim.notify("Only two revisions can be selected", vim.log.levels.WARN)
					return
				end

				current_picker:toggle_selection(current_picker:get_selection_row())
				refresh_revision_picker(current_picker, cache.entries)
			end

			local function confirm_revisions()
				if state.loading then
					return
				end

				local current_picker = action_state.get_current_picker(prompt_bufnr)
				local revisions = selected_revisions_from_picker(current_picker)
				if #revisions ~= 2 then
					vim.notify("Select exactly two revisions with <Tab>", vim.log.levels.WARN)
					return
				end

				M.open_diff({
					cwd = diff_opts.cwd,
					from = revisions[1],
					to = revisions[2],
				})
			end

			map("i", "<Tab>", toggle_revision_selection, { nowait = true })
			map("n", "<Tab>", toggle_revision_selection, { nowait = true })
			map("i", "<CR>", confirm_revisions, { nowait = true })
			map("n", "<CR>", confirm_revisions, { nowait = true })
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
			picker:refresh(revision_finder(updated_cache.entries), { reset_prompt = false })
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

	local ok, files = pcall(diff_files, diff_opts)
	if not ok then
		vim.notify(files, vim.log.levels.ERROR)
		return
	end

	pickers.new(diff_opts, {
		prompt_title = diff_prompt_title(diff_opts),
		__locations_input = true,
		finder = finders.new_table({
			results = files,
			entry_maker = make_entry.gen_from_file(diff_opts),
		}),
		previewer = diff_previewer(diff_opts),
		sorter = conf.file_sorter(diff_opts),
		attach_mappings = function(prompt_bufnr, map)
			local function select_revisions()
				open_revision_picker(diff_opts)
			end

			map("i", "<C-r>", select_revisions, { nowait = true })
			map("n", "<C-r>", select_revisions, { nowait = true })
			return true
		end,
	}):find()
end

return M
