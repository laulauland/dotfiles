return {
	"stevearc/oil.nvim",
  dependencies = { { "echasnovski/mini.icons", opts = {} } },
	lazy = false,
	config = function()
		require("oil").setup({
		skip_confirm_for_simple_edits = true,
		columns = {
			"size",
			"permissions",
			"mtime",
		},
		experimental_watch_for_changes = true,
		view_options = {
			show_hidden = true,
			is_hidden_file = function(name, bufnr) return vim.startswith(name, ".") end,
			-- This function defines what will never be shown, even when `show_hidden` is set
			is_always_hidden = function(name, bufnr) return false end,
			-- Sort file names in a more intuitive order for humans. Is less performant,
			-- so you may want to set to false if you work with large directories.
			natural_order = true,
			sort = {
				-- sort order can be "asc" or "desc"
				-- see :help oil-columns to see which columns are sortable
				{ "type", "asc" },
				{ "name", "asc" },
			},
		},
		constrain_cursor = "name",
		keymaps = {
			["g?"] = "actions.show_help",
			["<CR>"] = "actions.select",
			-- ["l"] = "actions.select",
			["<C-CR>"] = "actions.select_vsplit",
			["<C-p>"] = "actions.preview",
			["<leader>"] = "actions.refresh",
			["-"] = "actions.parent",
			["<BS>"] = "actions.parent",
			-- ["h"] = "actions.parent",
			["_"] = "actions.open_cwd",
			["`"] = "actions.cd",
			["."] = "actions.cd",
			["~"] = "actions.tcd",
			["go"] = "actions.open_external",
			["g."] = "actions.toggle_hidden",
		},
		use_default_keymaps = false,
	})
		local set_keymaps = require("utils").set_keymaps
		set_keymaps({
			n = {
				["<leader>e"] = { "<cmd>Oil<CR>", desc = "Open oil in current directory" },
        ["-"] = { "<cmd>Oil<CR>", desc = "Open oil in current directory" },
			}
		})
	end
}
