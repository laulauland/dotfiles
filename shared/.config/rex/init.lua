-- ctrl-hjkl moves between Rex blocks, but passes through to (n)vim so it can
-- move between its own splits first. Nvim calls `rex focus` at its edge (see
-- nvim/plugin/navigation.lua). Same idea as paul-enz/vim-rex-navigator.
local vim_names = { vim = true, nvim = true, view = true, vimdiff = true }

local function in_vim()
	local ok, proc = pcall(rex.block.call, "com.superlogical.terminal", "process")
	local fg = ok and proc and proc.foreground
	return fg ~= nil and (vim_names[fg.name] or vim_names[fg.argv0]) == true
end

for key, direction in pairs({ ["ctrl+h"] = "left", ["ctrl+j"] = "down", ["ctrl+k"] = "up", ["ctrl+l"] = "right" }) do
	rex.bind(key, function(ctx)
		if in_vim() then
			return false
		end
		rex.call("session.focus_direction", { session_id = ctx.session_id, direction = direction })
		return true
	end)
end
