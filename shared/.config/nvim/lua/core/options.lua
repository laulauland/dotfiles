local in_tmux = vim.env.TMUX ~= nil and vim.env.TMUX ~= ""

if in_tmux then
    vim.g.clipboard = {
        name = "tmux",
        copy = {
            ["+"] = {"tmux", "load-buffer", "-w", "-"},
            ["*"] = {"tmux", "load-buffer", "-w", "-"},
        },
        paste = {
            ["+"] = {"tmux", "save-buffer", "-"},
            ["*"] = {"tmux", "save-buffer", "-"},
        },
    }
else
    vim.g.clipboard = {
        name = "OSC 52",
        copy = {
            ["+"] = require("vim.ui.clipboard.osc52").copy("+"),
            ["*"] = require("vim.ui.clipboard.osc52").copy("*"),
        },
        paste = {
            ["+"] = require("vim.ui.clipboard.osc52").paste("+"),
            ["*"] = require("vim.ui.clipboard.osc52").paste("*"),
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
