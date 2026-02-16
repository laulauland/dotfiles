local wezterm = require("wezterm")
local act = wezterm.action

local M = {}

local function get_projects()
	local projects = {}
	local seen = {}
	local home = wezterm.home_dir

	-- Support both ~/Code (macOS) and ~/code (Linux)
	local code_dir = home .. "/Code"
	if wezterm.run_child_process({ "/bin/test", "-d", home .. "/code" }) then
		code_dir = home .. "/code"
	end

	local success, stdout, stderr = wezterm.run_child_process({
		"/bin/sh", "-lc",
		"fd -HI --type d --max-depth 3 --prune .git '" .. code_dir .. "' --exec dirname {}"
	})

	if not success then
		wezterm.log_error("Failed to run fd: " .. stderr)
		return nil
	end

	for line in stdout:gmatch("([^\n]*)\n?") do
		if line ~= "" and not seen[line] then
			seen[line] = true
			local label = line
			local id = line:gsub(".*/", "")
			table.insert(projects, { label = tostring(label), id = tostring(id) })
		end
	end

	return projects
end

M.toggle = function(window, pane)
	local projects = get_projects()
	if not projects then return end

	window:perform_action(
		act.InputSelector({
			action = wezterm.action_callback(function(win, _, id, label)
				if not id and not label then
					wezterm.log_info("Cancelled")
				else
					wezterm.log_info("Selected " .. label)
					win:perform_action(
						act.SwitchToWorkspace({ name = id, spawn = { cwd = label } }),
						pane
					)
				end
			end),
			fuzzy = true,
			title = "Select project",
			choices = projects,
		}),
		pane
	)
end

M.rename = function(window, pane)
	window:perform_action(
		act.PromptInputLine({
			description = "New name for workspace '" .. window:active_workspace() .. "'",
			action = wezterm.action_callback(function(win, _, line)
				if line and line ~= "" then
					wezterm.mux.rename_workspace(win:active_workspace(), line)
				end
			end),
		}),
		pane
	)
end

return M
