vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.g.whitespace = true
-- oil.nvim replaces netrw
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

local in_tmux = vim.env.TMUX ~= nil and vim.env.TMUX ~= ""
local termfeatures = vim.g.termfeatures or {}

-- OSC 52 clipboard reads are not widely supported and make every paste with
-- `clipboard=unnamedplus` pause at "Awaiting OSC 52 response". Prefer native
-- clipboard tools for a unified clipboard, and keep tmux as a last-resort
-- fallback instead of forcing OSC 52.
termfeatures.osc52 = false
vim.g.termfeatures = termfeatures

local function executable(command)
    return vim.fn.executable(command) == 1
end

if executable("pbcopy") and executable("pbpaste") then
    vim.g.clipboard = {
        name = "macOS clipboard",
        copy = {
            ["+"] = { "pbcopy" },
            ["*"] = { "pbcopy" },
        },
        paste = {
            ["+"] = { "pbpaste" },
            ["*"] = { "pbpaste" },
        },
    }
elseif executable("wl-copy") and executable("wl-paste") then
    vim.g.clipboard = {
        name = "Wayland clipboard",
        copy = {
            ["+"] = { "wl-copy", "--foreground", "--type", "text/plain" },
            ["*"] = { "wl-copy", "--foreground", "--primary", "--type", "text/plain" },
        },
        paste = {
            ["+"] = { "wl-paste", "--no-newline" },
            ["*"] = { "wl-paste", "--no-newline", "--primary" },
        },
    }
elseif in_tmux and executable("tmux") then
    vim.g.clipboard = {
        name = "tmux",
        copy = {
            ["+"] = { "tmux", "load-buffer", "-w", "-" },
            ["*"] = { "tmux", "load-buffer", "-w", "-" },
        },
        paste = {
            ["+"] = { "tmux", "save-buffer", "-" },
            ["*"] = { "tmux", "save-buffer", "-" },
        },
    }
end

local options = {
    clipboard = "unnamedplus",
    cmdheight = 0,
    colorcolumn = "80",
    completeopt = "menuone,noselect,fuzzy",
    cursorline = true,
    expandtab = false,
    exrc = true,
    fillchars = { eob = " " },
    foldlevelstart = 99,
    guicursor = {
        "n-sm:block",
        "c-i-ci-ve:ver25",
        "r-cr-o:hor20",
        "v:hor50",
        "n-i-sm:blinkwait600-blinkoff50-blinkon100",
    },
    guifont = { "Berkeley Mono Variable", ":h15" },
    linebreak = true,
    list = true,
    listchars = { tab = "  ", trail = "·" }, -- baseline; <leader>uw toggles
    number = true,
    pumheight = 10,
    pummaxwidth = 40,
    relativenumber = true,
    shiftwidth = 2,
    showtabline = 0,
    signcolumn = "yes",
    smartcase = true,
    smartindent = true,
    splitbelow = true,
    splitright = true,
    swapfile = false,
    tabstop = 2,
    timeoutlen = 1000,
    ttimeoutlen = 0,
    title = true,
    undofile = true,
    updatetime = 300,
    winborder = "rounded",
    writebackup = false,
}

for key, value in pairs(options) do
    vim.opt[key] = value
end
