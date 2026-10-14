require("mini.icons").setup()
MiniIcons.mock_nvim_web_devicons()
require("fidget").setup()

require("which-key").setup({
	preset = "modern",
	spec = {
		{ "<leader>f", group = "Find" },
		{ "<leader>c", group = "Code / Quickfix" },
		{ "<leader>G", group = "Git" },
		{ "<leader>u", group = "Toggle" },
	},
})
vim.keymap.set("n", "<leader>?", function() require("which-key").show({ global = false }) end, {
	desc = "Buffer-local keymaps (which-key)",
})
