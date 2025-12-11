local M = {}

M.set_keymaps = function(map_table)
    for mode, maps in pairs(map_table) do
        for keymap, options in pairs(maps) do
            if options then
                local cmd = options
                local keymap_opts = {}
                if type(options) == "table" then
                    cmd = options[1]
                    keymap_opts = vim.tbl_deep_extend("force", options, keymap_opts)
                    keymap_opts[1] = nil
                end
                vim.keymap.set(mode, keymap, cmd, keymap_opts)
            end
        end
    end
end

M.vim_options = function(options)
    for scope, table in pairs(options) do
        for setting, value in pairs(table) do
            vim[scope][setting] = value
        end
    end
end

M.add_cmp_source = function(source)
    -- load cmp if available
    local cmp_avail, cmp = pcall(require, "cmp")
    if cmp_avail then
        -- get the current cmp config
        local config = cmp.get_config()
        -- add the source to the list of sources
        table.insert(config.sources, source)
        -- call the setup function again
        cmp.setup(config)
    end
end

--- Get highlight properties for a given highlight name
-- @param name highlight group name
-- @return table of highlight group properties
M.get_hlgroup = function(name, fallback)
    if vim.fn.hlexists(name) == 1 then
        local hl = vim.api.nvim_get_hl_by_name(name, vim.o.termguicolors)
        local old_true_val = hl[true]
        hl[true] = nil
        if not vim.tbl_isempty(hl) then
            hl[true] = old_true_val
            if not hl["foreground"] then hl["foreground"] = "NONE" end
            if not hl["background"] then hl["background"] = "NONE" end
            hl.fg, hl.bg, hl.sp = hl.foreground, hl.background, hl.special
            hl.ctermfg, hl.ctermbg = hl.foreground, hl.background
            return hl
        end
    end
    return fallback
end


--- register mappings table with which-key
-- @param mappings nested table of mappings where the first key is the mode, the second key is the prefix, and the value is the mapping table for which-key
-- @param opts table of which-key options when setting the mappings (see which-key documentation for possible values)
--M.which_key_register = function(mappings, opts)
--    local status_ok, which_key = pcall(require, "which-key")
--    if not status_ok then return end
--    for mode, prefixes in pairs(mappings) do
--        for prefix, mapping_table in pairs(prefixes) do
--            which_key.register(
--                mapping_table,
--                vim.tbl_deep_extend(opts, {
--                    mode = mode,
--                    prefix = prefix,
--                    buffer = nil,
--                    silent = true,
--                    noremap = true,
--                    nowait = true,
--                })
--            )
--        end
--    end
--    print(which_key.register)
--end

return M
