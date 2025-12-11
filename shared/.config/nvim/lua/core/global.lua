local g = {
    mapleader = " ",
    maplocalleader = "\\",
    whitespace = true,

    zipPlugin = false,
    load_black = false,
    loaded_2html_plugin = true,
    loaded_getscript = true,
    loaded_getscriptPlugin = true,
    loaded_gzip = true,
    loaded_logipat = true,
    loaded_matchit = true,
    loaded_netrwPlugin = 1,
    loaded_remote_plugins = true,
    loaded_tar = true,
    loaded_tarPlugin = true,
    loaded_zip = true,
    loaded_zipPlugin = true,
    loaded_vimball = true,
    loaded_vimballPlugin = true,
    skip_ts_context_commentstring_module = true,
		slime_target = "neovim",
}

for key, value in pairs(g) do
    vim.g[key] = value
end
