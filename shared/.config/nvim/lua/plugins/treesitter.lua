return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter").setup({
        install_dir = vim.fn.stdpath("data") .. "/site",
      })

      -- The main branch dropped `ensure_installed`; parsers must be installed
      -- explicitly or `vim.treesitter.get_node()` returns nil (which silently
      -- breaks the <CR> incremental selection below). Install any missing ones
      -- asynchronously on startup. Bundled parsers (lua, markdown, vim, ...)
      -- get a site copy too, which is harmless and keeps them current.
      local ensure = {
        "bash", "css", "elixir", "erlang", "go", "gomod", "heex",
        "html", "javascript", "json", "lua", "luadoc",
        "markdown", "markdown_inline", "python", "rust", "toml",
        "tsx", "typescript", "vim", "vimdoc", "yaml", "zig",
      }
      local installed = require("nvim-treesitter").get_installed()
      local missing = vim.tbl_filter(function(lang)
        return not vim.tbl_contains(installed, lang)
      end, ensure)
      if #missing > 0 then
        require("nvim-treesitter").install(missing)
      end

      local group = vim.api.nvim_create_augroup("UserTreesitter", { clear = true })
      vim.api.nvim_create_autocmd("FileType", {
        group = group,
        callback = function(args)
          local ok = pcall(vim.treesitter.start, args.buf)
          if ok then
            vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
            vim.wo.foldmethod = "expr"
            vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })

      -- Incremental selection: <CR> grow, <C-n> grow to scope, <BS> shrink.
      -- Replaces the legacy `incremental_selection` module dropped in main branch.
      local sel_stack = {}
      local sel_in_progress = false

      local function range_eq(a, b)
        local ar1, ac1, ar2, ac2 = a:range()
        local br1, bc1, br2, bc2 = b:range()
        return ar1 == br1 and ac1 == bc1 and ar2 == br2 and ac2 == bc2
      end

      local function select_node(node)
        local sr, sc, er, ec = node:range()
        if ec == 0 and er > sr then
          er = er - 1
          ec = math.max(1, vim.fn.col({ er + 1, "$" }) - 1)
        end
        -- Drive the selection by cursor movement rather than '<,'> marks + gv.
        -- A marks+gv reselect issued from inside a visual-mode mapping gets
        -- clobbered when Neovim reasserts the pre-mapping selection on return,
        -- leaving the stack one grow ahead of what is actually highlighted.
        -- Leaving visual, re-entering with `v`, then extending the cursor to the
        -- node end survives that (this is what nvim-treesitter's old module did).
        sel_in_progress = true
        if vim.fn.mode():match("[vV\22]") then
          vim.cmd("normal! \27")
        end
        vim.fn.setpos(".", { 0, sr + 1, sc + 1, 0 })
        vim.cmd("normal! v")
        vim.fn.setpos(".", { 0, er + 1, ec, 0 })
        sel_in_progress = false
      end

      local function init_or_grow()
        local buf = vim.api.nvim_get_current_buf()
        local s = sel_stack[buf] or {}
        sel_stack[buf] = s
        local node
        if #s == 0 then
          node = vim.treesitter.get_node()
          if not node then return end
        else
          local cur = s[#s]
          local p = cur:parent()
          while p and range_eq(p, cur) do p = p:parent() end
          if not p then return end
          node = p
        end
        table.insert(s, node)
        select_node(node)
      end

      local function scope_grow()
        local buf = vim.api.nvim_get_current_buf()
        local s = sel_stack[buf] or {}
        sel_stack[buf] = s
        local cur = s[#s] or vim.treesitter.get_node()
        if not cur then return end
        local parser = vim.treesitter.get_parser(buf)
        if not parser then return end
        local ok, query = pcall(vim.treesitter.query.get, parser:lang(), "locals")
        if not ok or not query then return end
        local root = parser:parse()[1]:root()
        local cr1, cc1, cr2, cc2 = cur:range()
        local best
        for id, node in query:iter_captures(root, buf, 0, -1) do
          if query.captures[id] == "local.scope" then
            local nr1, nc1, nr2, nc2 = node:range()
            local contains = (nr1 < cr1 or (nr1 == cr1 and nc1 <= cc1))
                and (nr2 > cr2 or (nr2 == cr2 and nc2 >= cc2))
            local bigger = not (nr1 == cr1 and nc1 == cc1 and nr2 == cr2 and nc2 == cc2)
            if contains and bigger then
              if not best then
                best = node
              else
                local br1, bc1, br2, bc2 = best:range()
                local smaller = (nr1 > br1 or (nr1 == br1 and nc1 > bc1))
                    and (nr2 < br2 or (nr2 == br2 and nc2 < bc2))
                if smaller then best = node end
              end
            end
          end
        end
        if not best then return end
        if #s == 0 then table.insert(s, cur) end
        table.insert(s, best)
        select_node(best)
      end

      local function shrink()
        local buf = vim.api.nvim_get_current_buf()
        local s = sel_stack[buf]
        if not s or #s <= 1 then return end
        table.remove(s)
        select_node(s[#s])
      end

      vim.api.nvim_create_autocmd("ModeChanged", {
        group = group,
        pattern = "*:n",
        callback = function(args)
          if not sel_in_progress then sel_stack[args.buf] = nil end
        end,
      })

      vim.keymap.set({ "n", "x" }, "<CR>", init_or_grow, { desc = "Treesitter: grow selection" })
      vim.keymap.set("x", "<C-n>", scope_grow, { desc = "Treesitter: grow to scope" })
      vim.keymap.set("x", "<BS>", shrink, { desc = "Treesitter: shrink selection" })
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter-context",
    opts = {
      mode = "topline",
      max_lines = 3,
    },
  },
  {
    "folke/ts-comments.nvim",
    event = "VeryLazy",
    opts = {},
    enabled = vim.fn.has("nvim-0.10.0") == 1,
  },
}
