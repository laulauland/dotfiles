local M = {}

local wezterm = require("wezterm")
local act = wezterm.action
local fmt = wezterm.format

local function is_vim(pane)
  -- return pane:get_user_vars().IS_NVIM == "true"
  local fg_proc = pane:get_foreground_process_name()
  if fg_proc == nil then
    return true
  end
  return fg_proc:find("n?vim") ~= nil
end

M.bind_if = function(cond, key, mods, action)
  local function callback(win, pane)
    if cond(pane) then
      win:perform_action(action, pane)
    else
      win:perform_action(act.SendKey({ key = key, mods = mods }), pane)
    end
  end

  return { key = key, mods = mods, action = wezterm.action_callback(callback) }
end

M.is_outside_vim = function(pane)
  return not is_vim(pane)
end

M.is_dark = function()
  if wezterm.gui then
    return wezterm.gui.get_appearance():find("Dark")
  end
  return true
end

M.update_status_bar = function(window, pane)
	local info = pane:get_foreground_process_info()

  local cwd = info and info.cwd or "sessionizer"

  cwd = cwd:gsub("^/Users/laurynas%-fp", "~")

	window:set_right_status("")
	window:set_left_status(
		 "     " ..
		fmt({ { Text = " " .. window:active_workspace() } })
	)
end

return M
