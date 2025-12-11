return {
	"ThePrimeagen/harpoon",
	branch = "harpoon2",
	dependencies = { "nvim-lua/plenary.nvim" },
	config = function()
		local harpoon = require("harpoon")

		harpoon:setup({
			settings = {
				save_on_toggle = true,
			},
		})

		harpoon:extend({
			UI_CREATE = function(ctx)
				vim.keymap.set(
					"n",
					"<C-CR>",
					function() harpoon.ui:select_menu_item({ vsplit = true }) end,
					{ buffer = ctx.bufnr }
				)
				vim.keymap.set(
					"n",
					"<C-t>",
					function() harpoon.ui:select_menu_item({ tabedit = true }) end,
					{ buffer = ctx.bufnr }
				)
			end,
		})

		require("utils").set_keymaps({
			n = {
        ["<leader>fa"] = {
            function() harpoon.ui:toggle_quick_menu(harpoon:list()) end,
            desc = "Harpoon menu",
        },
        ["<C-e>"] = {
            function() harpoon.ui:toggle_quick_menu(harpoon:list()) end,
            desc = "Harpoon menu",
        },
        ["<leader>a"] = {
            function() harpoon:list():add() end,
            desc = "Add to Harpoon",
        },
        ["<leader>1"] = {
            function() harpoon:list():select(1) end,
            desc = "Harpoon 1",
        },
        ["<leader>2"] = {
            function() harpoon:list():select(2) end,
            desc = "Harpoon 2",
        },
        ["<leader>3"] = {
            function() harpoon:list():select(3) end,
            desc = "Harpoon 3",
        },
        ["<leader>4"] = {
            function() harpoon:list():select(4) end,
            desc = "harpoon 4",
        },
        ["<leader>h"] = {
            function() harpoon:list():select(1) end,
            desc = "Harpoon 1",
        },
        ["<leader>j"] = {
            function() harpoon:list():select(2) end,
            desc = "Harpoon 2",
        },
        ["<leader>k"] = {
            function() harpoon:list():select(3) end,
            desc = "Harpoon 3",
        },
        ["<leader>l"] = {
            function() harpoon:list():select(4) end,
            desc = "harpoon 4",
        },
			}
		})
	end
}
