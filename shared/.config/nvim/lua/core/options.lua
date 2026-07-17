local in_tmux = vim.env.TMUX ~= nil and vim.env.TMUX ~= ""
local in_herdr = vim.env.HERDR_ENV == "1"
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
elseif in_herdr then
    -- Herdr forwards OSC 52 writes to its foreground client but deliberately
    -- has no query/reply path. Map both registers to the supported `c` target;
    -- terminal paste still supplies local clipboard contents without a query.
    local osc52 = require("vim.ui.clipboard.osc52")
    local copy = osc52.copy("+")
    local empty_paste = function()
        return { {}, "v" }
    end

    vim.g.clipboard = {
        name = "Herdr OSC 52 (copy-only)",
        copy = {
            ["+"] = copy,
            ["*"] = copy,
        },
        paste = {
            ["+"] = empty_paste,
            ["*"] = empty_paste,
        },
    }
end

local options = {
    backup = false,
    clipboard = "unnamedplus",
    cmdheight = 0,
    colorcolumn = "80",
    completeopt = "menu,preview,menuone,noselect",
    cursorline = true,
    fileencoding = "utf-8",
    expandtab = false,
    exrc = true,
    mouse = "a",
    number = true,
    relativenumber = true,
    incsearch = true,
    fillchars = { eob = " " },
    hlsearch = true,
    lazyredraw = true,
    linebreak = true,
    list = true,
    listchars = { -- NOTE: these are the baseline
        tab = "  ",
        trail = "·",
    },
    foldcolumn = "0",
    foldlevelstart = 99,
    foldenable = true,
    --n-v-c-sm:block,i-ci-ve:ver25,r-cr-o:hor20
    guicursor = {
        "n-sm:block",
        "c-i-ci-ve:ver25",
        "r-cr-o:hor20",
        "v:hor50",
        "n-i-sm:blinkwait600-blinkoff50-blinkon100",
    },
    guifont = { "Berkeley Mono Variable", ":h15" },
    showmode = true,
    showtabline = 0,
    showcmd = true,
    shiftwidth = 2,
    signcolumn = "yes",
    smartindent = true,
    smartcase = true,
    splitbelow = true,
    splitright = true,
    swapfile = false,
    tabstop = 2,
    termguicolors = true,
    timeoutlen = 1000,
    ttimeoutlen = 0,
    title = true,
    undofile = true,
    updatetime = 300,
    --wrap = false,
    writebackup = false,
}

for key, value in pairs(options) do
    vim.opt[key] = value
end
