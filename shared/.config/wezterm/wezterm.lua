local wezterm = require("wezterm")
local act = wezterm.action

local update_status_bar = require("utils").update_status_bar

local keys = require("keybinds")
local launch_menu = {
	{
		args = { "/opt/homebrew/bin/btm" },
	},
	{
		args = { "lazydocker" },
	},
}

wezterm.on("update-status", update_status_bar)

wezterm.on('augment-command-palette', function(window, pane)
	return {
		{
			brief = 'Rename tab',
			icon = 'md_rename_box',
			action = act.PromptInputLine({
				description = wezterm.format {
					{ Attribute = { Intensity = 'Bold' } },
					{ Text = 'Enter name for new tab' },
				},
				action = wezterm.action_callback(function(window, _, line)
					if line then
						window:active_tab():set_title(line)
					end
				end),
			}),
		} }
end)

wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
	-- Check if tab has been manually renamed
	if tab.tab_title and #tab.tab_title > 0 then
		return {
			{ Text = " " .. tab.tab_title .. " " },
		}
	end

	-- Extract just the process name without path
	local process = tab.active_pane.foreground_process_name
	process = process:match("([^/]+)$") or process
	return {
		{ Text = " " .. process .. " " },
	}
end)

return {
	check_for_updates = true,
	allow_square_glyphs_to_overflow_width = "WhenFollowedBySpace",
	default_cursor_style = "BlinkingBlock",
	-- max_fps = 240,
	tab_max_width = 12,
	-- animation_fps = 1,
	freetype_load_flags = "NO_HINTING",
	launch_menu = launch_menu,
	cursor_blink_ease_in = "Constant",
	cursor_blink_ease_out = "Constant",
	status_update_interval = 500,
	cursor_thickness = 3,
	default_cwd = "~/Code",
	exit_behavior = "Close",
	window_close_confirmation = "NeverPrompt",
	native_macos_fullscreen_mode = false,
	quick_select_patterns = {
		"[A-Za-z0-9-_]{22}",
	},
	window_padding = {
		left = 2,
		right = 0,
		top = 0,
		bottom = 0,
	},
	enable_scroll_bar = false,
	color_scheme = "Alabaster",
	-- color_scheme = "Tomorrow Night (Gogh)",
	-- color_scheme = "Paper (Gogh)",
	-- color_scheme = "XCode Dusk (base16)",
	window_frame = {
		active_titlebar_bg = "#f7f7f7",
		inactive_titlebar_bg = "#f7f7f7",
	},
	colors = {
		tab_bar = {
			background = "#f7f7f7",
			active_tab = {
				bg_color = "#f7f7f7",
				fg_color = "#000000",
			},
			inactive_tab = {
				bg_color = "#e8e8e8",
				fg_color = "#666666",
			},
			inactive_tab_hover = {
				bg_color = "#efefef",
				fg_color = "#333333",
			},
			new_tab = {
				bg_color = "#f7f7f7",
				fg_color = "#666666",
			},
			new_tab_hover = {
				bg_color = "#efefef",
				fg_color = "#333333",
			},
		},
	},
	ui_key_cap_rendering = "AppleSymbols",
	command_palette_font_size = 14.0,
	use_fancy_tab_bar = true,
	window_decorations = "INTEGRATED_BUTTONS|RESIZE",
	-- window_background_opacity = 0.90,
	hide_tab_bar_if_only_one_tab = false,
	hide_mouse_cursor_when_typing = false,
	adjust_window_size_when_changing_font_size = false,
	font_size = 14.0,
	line_height = 1.2,
	font = wezterm.font("Berkeley Mono"),
	harfbuzz_features = { "calt=0", "clig=0", "liga=0" },
	warn_about_missing_glyphs = false,
	mouse_bindings = {
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "NONE",
			action = act.CompleteSelection("ClipboardAndPrimarySelection"),
		},
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "SUPER",
			action = act.OpenLinkAtMouseCursor,
		},
		{
			event = { Down = { streak = 1, button = "Left" } },
			mods = "SUPER",
			action = act.Nop,
		},
		{
			event = { Down = { streak = 3, button = "Left" } },
			action = act.SelectTextAtMouseCursor("SemanticZone"),
			mods = "NONE",
		},
	},

	leader = { key = "Space", mods = "CTRL", timeout_milliseconds = 1000 },
	keys = keys,
}
