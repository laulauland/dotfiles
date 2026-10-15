-- jj pickers for fzf-lua: tracked files, and a diff picker over the files
-- changed between two revisions (default trunk() → @) with a revision picker.
local M = {}

local DEFAULT_FROM = "trunk()"
local DEFAULT_TO = "@"
local STACK_REVSET = "trunk()::@"
local REVISION_LIMIT = 200

local revision_cache_by_cwd = {}

local function fzf() return require("fzf-lua") end

local function jj_root(cwd)
	if cwd then return cwd end
	local result = vim.system({ "jj", "root" }, { text = true }):wait()
	if result.code ~= 0 then
		return nil, vim.trim(result.stderr ~= "" and result.stderr or "Not a jj repository")
	end
	return vim.trim(result.stdout)
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
	if opts.from then vim.list_extend(cmd, { "--from", opts.from }) end
	if opts.to then vim.list_extend(cmd, { "--to", opts.to }) end
end

local function diff_title(opts)
	if opts.revision then return "Jujutsu Diff (" .. opts.revision .. ")" end
	return "Jujutsu Diff (" .. (opts.from or "@") .. " → " .. (opts.to or "@") .. ")"
end

local function diff_files(opts)
	local args = { "diff", "--name-only", "--no-pager" }
	append_diff_args(args, opts)
	return vim.split(run_jj(opts.cwd, args), "\n", { trimempty = true })
end

-- Shell command for fzf's --preview; `{}` is the (quoted) file under the cursor.
local function diff_preview_cmd(opts)
	local cmd = { "jj", "diff", "--no-pager" }
	if vim.fn.executable("difft") == 1 then
		vim.list_extend(cmd, { "--tool", "difft", "--color=always" })
	else
		vim.list_extend(cmd, { "--git", "--color=always" })
	end
	append_diff_args(cmd, opts)
	local parts = vim.tbl_map(vim.fn.shellescape, cmd)
	return "cd " .. vim.fn.shellescape(opts.cwd) .. " && COLUMNS=$FZF_PREVIEW_COLUMNS DFT_WIDTH=$FZF_PREVIEW_COLUMNS "
		.. table.concat(parts, " ") .. " -- {}"
end

-- Revision cache ------------------------------------------------------------

local function log_template()
	return table.concat({
		"change_id.short()", '"\t"', 'bookmarks.join(" ")', '"\t"',
		"description.first_line()", '"\n"',
	}, " ++ ")
end

local function build_revision_entries(stdout)
	local entries, seen = {}, {}
	for _, line in ipairs(vim.split(stdout or "", "\n", { trimempty = true })) do
		local fields = vim.split(line, "\t", { plain = true })
		local change_id, bookmarks, description = fields[1] or "", fields[2] or "", fields[3] or ""
		if change_id ~= "" and not seen[change_id] then
			seen[change_id] = true
			local label = table.concat(vim.tbl_filter(function(part) return part ~= "" end, {
				change_id, bookmarks, description ~= "" and description or "(no description)",
			}), "  ")
			entries[#entries + 1] = { rev = change_id, label = label }
		end
	end
	return entries
end

local function jj_async(cwd, args, parse, on_done)
	vim.system(vim.list_extend({ "jj" }, args), { text = true, cwd = cwd }, function(result)
		local ok, value = pcall(function()
			if result.code ~= 0 then
				error(vim.trim(result.stderr ~= "" and result.stderr or result.stdout))
			end
			return parse(result.stdout)
		end)
		vim.schedule(function() on_done(ok, value) end)
	end)
end

local function finish_cache_request(cache)
	cache.pending = cache.pending - 1
	if cache.pending > 0 then return end
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
	for _, waiter in ipairs(waiters) do waiter(cache) end
end

local function ensure_revision_cache(cwd)
	local cache = revision_cache_by_cwd[cwd]
	if cache and (cache.state == "loading" or cache.state == "ready") then return cache end

	cache = { state = "loading", resolved = {}, waiters = {}, pending = 3 }
	revision_cache_by_cwd[cwd] = cache

	jj_async(cwd, {
		"log", "--revisions", STACK_REVSET, "--limit", tostring(REVISION_LIMIT),
		"--no-graph", "--template", log_template(),
	}, build_revision_entries, function(ok, value)
		if ok then cache.entries = value else cache.error = value end
		finish_cache_request(cache)
	end)

	for _, revision in ipairs({ DEFAULT_FROM, DEFAULT_TO }) do
		jj_async(cwd, {
			"log", "--revisions", revision, "--limit", "1", "--no-graph",
			"--template", 'change_id.short() ++ "\n"',
		}, vim.trim, function(ok, value)
			if ok and value ~= "" then cache.resolved[revision] = value end
			finish_cache_request(cache)
		end)
	end

	return cache
end

local function resolved_revision(cache, revision)
	return cache and cache.resolved[revision] or revision
end

local function find_entry_index(entries, revision)
	for index, entry in ipairs(entries) do
		if entry.rev == revision then return index end
	end
end

-- Revision picker -----------------------------------------------------------

-- fzf multi-select capped at two; selection order gives the roles (first =
-- FROM, second = TO). The current range is preselected on load, and the
-- preview shows the roles plus the revision under the cursor.
local function show_revision_picker(diff_opts, cache)
	local entries = cache.entries
	local lines = vim.tbl_map(function(e) return e.rev .. "\t" .. e.label end, entries)

	local from_idx = find_entry_index(entries, resolved_revision(cache, diff_opts.from or DEFAULT_FROM))
	local to_idx = find_entry_index(entries, resolved_revision(cache, diff_opts.to or DEFAULT_TO))
	local load = {}
	for _, idx in ipairs({ from_idx, to_idx }) do
		load[#load + 1] = ("pos(%d)+toggle"):format(idx)
	end
	if to_idx then load[#load + 1] = ("pos(%d)"):format(to_idx) end

	local preview = "cd " .. vim.fn.shellescape(diff_opts.cwd) .. [[ && set -- {+1}; ]]
		.. [[printf 'FROM  %s\nTO    %s\n\n' "${1:--}" "${2:--}"; ]]
		.. [[jj log --no-pager --color=always -r {1} -T builtin_log_detailed --no-graph]]

	fzf().fzf_exec(lines, {
		cwd = diff_opts.cwd,
		winopts = { title = " JJ revisions " },
		fzf_opts = {
			["--multi"] = "2",
			["--delimiter"] = "\t",
			["--with-nth"] = "2..",
			["--no-sort"] = true,
			["--header"] = "<Tab>: first = FROM, second = TO   <CR>: diff",
			["--preview"] = preview,
		},
		keymap = { fzf = vim.tbl_isempty(load) and {} or { load = table.concat(load, "+") } },
		actions = {
			["enter"] = function(selected)
				local revisions = vim.tbl_map(function(line) return line:match("^[^\t]+") end, selected)
				if #revisions ~= 2 then
					vim.notify("Select exactly two revisions with <Tab>", vim.log.levels.WARN)
					return show_revision_picker(diff_opts, cache)
				end
				M.open_diff({ cwd = diff_opts.cwd, from = revisions[1], to = revisions[2] })
			end,
		},
	})
end

local function open_revision_picker(diff_opts)
	local cache = ensure_revision_cache(diff_opts.cwd)
	local function open(c)
		if c.state ~= "ready" then
			vim.notify(c.error, vim.log.levels.ERROR)
			return
		end
		show_revision_picker(diff_opts, c)
	end
	if cache.state == "loading" then
		vim.notify("Loading revisions…")
		table.insert(cache.waiters, open)
	else
		open(cache)
	end
end

-- Public pickers ------------------------------------------------------------

--- Files changed between two revisions. opts: cwd, from, to, or revision.
--- <CR>/<C-s>/<C-v>/<C-t> open the file, <C-r> picks a new revision range.
function M.open_diff(opts)
	opts = opts or {}
	local cwd, root_err = jj_root(opts.cwd)
	if not cwd then
		vim.notify(root_err, vim.log.levels.ERROR)
		return
	end

	local diff_opts = vim.tbl_extend("force", { cwd = cwd, from = DEFAULT_FROM, to = DEFAULT_TO }, opts)
	ensure_revision_cache(diff_opts.cwd)

	local ok, files = pcall(diff_files, diff_opts)
	if not ok then
		vim.notify(files, vim.log.levels.ERROR)
		return
	end

	local actions = vim.deepcopy(require("fzf-lua.config").globals.actions.files)
	actions["ctrl-r"] = function() open_revision_picker(diff_opts) end

	fzf().fzf_exec(files, {
		cwd = diff_opts.cwd,
		winopts = { title = " " .. diff_title(diff_opts) .. " " },
		fzf_opts = { ["--multi"] = true, ["--header"] = "<C-r>: pick revisions" },
		preview = diff_preview_cmd(diff_opts),
		actions = actions,
	})
end

--- jj tracked files (`jj file list`). Errors outside a jj repo so callers can
--- fall back to git files. opts are passed to fzf-lua's files picker.
function M.files(opts)
	opts = opts or {}
	local root, err = jj_root(opts.cwd)
	if not root then error(err) end
	return fzf().files(vim.tbl_extend("force", {
		cwd = root,
		cmd = "jj file list --no-pager",
		hidden = false, -- else fzf-lua appends --hidden to cmd
		winopts = { title = " JJ files " },
	}, opts))
end

return M
