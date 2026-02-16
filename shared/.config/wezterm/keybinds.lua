local wezterm = require("wezterm")
local act = wezterm.action
local bind_if = require("utils").bind_if
local is_outside_vim = require("utils").is_outside_vim
local sessionizer = require("sessionizer")

local keys = {
	{ key = "x", mods = "LEADER|CTRL", action = act.SendString("\x18") },
	{ key = "Tab", mods = "CTRL", action = act.SendKey({ key = "Tab", mods = "CTRL" }) },
	{ key = "Space", mods = "LEADER", action = act.QuickSelect },
	bind_if(is_outside_vim, "h", "CTRL", act.ActivatePaneDirection("Left")),
	bind_if(is_outside_vim, "l", "CTRL", act.ActivatePaneDirection("Right")),
	bind_if(is_outside_vim, "j", "CTRL", act.ActivatePaneDirection("Down")),
	bind_if(is_outside_vim, "k", "CTRL", act.ActivatePaneDirection("Up")),
	{ key = "h", mods = "LEADER", action = act.ActivatePaneDirection("Left") },
	{ key = "l", mods = "LEADER", action = act.ActivatePaneDirection("Right") },
	{ key = "k", mods = "LEADER", action = act.ActivatePaneDirection("Up") },
	{ key = "j", mods = "LEADER", action = act.ActivatePaneDirection("Down") },
	{ key = "K", mods = "LEADER", action = act.AdjustPaneSize({ "Up", 5 }) },
	{ key = "J", mods = "LEADER", action = act.AdjustPaneSize({ "Down", 5 }) },
	{ key = "H", mods = "LEADER", action = act.AdjustPaneSize({ "Left", 5 }) },
	{ key = "L", mods = "LEADER", action = act.AdjustPaneSize({ "Right", 5 }) },
	{ key = "UpArrow", mods = "LEADER", action = act.AdjustPaneSize({ "Up", 5 }), },
	{ key = "DownArrow", mods = "LEADER", action = act.AdjustPaneSize({ "Down", 5 }), },
	{ key = "LeftArrow", mods = "LEADER", action = act.AdjustPaneSize({ "Left", 5 }), },
	{ key = "RightArrow", mods = "LEADER", action = act.AdjustPaneSize({ "Right", 5 }), },
	{ key = "UpArrow", mods = "SHIFT", action = act.ScrollToPrompt(-1) },
	{ key = "DownArrow", mods = "SHIFT", action = act.ScrollToPrompt(1) },
	{ key = "P", mods = "CTRL|SHIFT", action = act.ScrollToPrompt(-1) },
	{ key = "N", mods = "CTRL|SHIFT", action = act.ScrollToPrompt(1) },
	{ key = "Return", mods = "SHIFT", action = act.SendString("\n") },
	{ key = "w", mods = "CMD", action = act.CloseCurrentPane({ confirm = true }), },
	{ key = "d", mods = "SUPER|SHIFT", action = act.SplitVertical({ domain = "CurrentPaneDomain" }), },
	{ key = "d", mods = "SUPER", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }), },
	{ key = "Return", mods = "SUPER", action = act.ToggleFullScreen },
	{ key = "Return", mods = "ALT", action = act.DisableDefaultAssignment },
	{ key = "Return", mods = "LEADER", action = act.TogglePaneZoomState },
	{ key = "<", mods = "LEADER", action = act.MoveTabRelative(-1) },
	{ key = ">", mods = "LEADER", action = act.MoveTabRelative(1) },
	{ key = "p", mods = "SUPER|SHIFT", action = act.ActivateCommandPalette },
	{ key = "p", mods = "SUPER", action = act.ShowLauncherArgs({ flags = "FUZZY|WORKSPACES" }), },
	{ key = "w", mods = "LEADER", action = act.ShowLauncherArgs({ flags = "FUZZY|WORKSPACES" }), },
	{ key = "t", mods = "LEADER", action = act.ShowTabNavigator },
	{ key = "y", mods = "LEADER", action = act.ActivateCopyMode },
	{ key = "f", mods = "LEADER", action = wezterm.action_callback(sessionizer.toggle), },
	{ key = "o", mods = "SUPER", action = wezterm.action_callback(sessionizer.toggle), },
	{ key = "r", mods = "LEADER", action = wezterm.action_callback(sessionizer.rename), },
}

return keys
