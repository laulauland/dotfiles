-- Fix broken LuaJIT package paths from zerobrew build
-- LuaJIT was compiled with truncated paths (bare "/opt/zb" instead of proper ?.lua patterns)
local zb = "/opt/zb"
local zb_pat = vim.pesc(zb) .. "$"
package.path = package.path:gsub(zb_pat, zb .. "/share/luajit-2.1/?.lua;" .. zb .. "/share/lua/5.1/?.lua;" .. zb .. "/share/lua/5.1/?/init.lua")
package.cpath = package.cpath:gsub(zb_pat, zb .. "/lib/lua/5.1/?.so")

require("core.options")
require("core.global")
require("core.keybinds")
require("core.autocmds")
require("core.lazy")
require("core.lsp")
