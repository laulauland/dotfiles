-- jj pickers for fzf-lua: tracked files, and a diff picker over the files
-- changed between two revisions (default trunk() → @).
local M = {}

local DEFAULT_FROM = "trunk()"
local DEFAULT_TO = "@"

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

--- Files changed between two revisions. opts: cwd, from, to, or revision.
--- <CR>/<C-x>/<C-v>/<C-t> open the file.
function M.open_diff(opts)
	opts = opts or {}
	local cwd, root_err = jj_root(opts.cwd)
	if not cwd then
		vim.notify(root_err, vim.log.levels.ERROR)
		return
	end

	local diff_opts = vim.tbl_extend("force", { cwd = cwd, from = DEFAULT_FROM, to = DEFAULT_TO }, opts)
	local ok, files = pcall(diff_files, diff_opts)
	if not ok then
		vim.notify(files, vim.log.levels.ERROR)
		return
	end

	fzf().fzf_exec(files, {
		cwd = diff_opts.cwd,
		winopts = { title = " " .. diff_title(diff_opts) .. " " },
		fzf_opts = { ["--multi"] = true },
		preview = diff_preview_cmd(diff_opts),
		actions = require("fzf-lua.config").globals.actions.files,
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
