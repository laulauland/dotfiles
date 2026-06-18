return {
	"folke/which-key.nvim",
	event = "VeryLazy",
	opts = {
		preset = "modern",
		spec = {
			{ "<leader>f", group = "Find" },
			{ "<leader>c", group = "Code / Quickfix" },
			{ "<leader>G", group = "Git" },
			{ "<leader>u", group = "Toggle" },
		},
	},
	keys = {
		{
			"<leader>?",
			function() require("which-key").show({ global = false }) end,
			desc = "Buffer-local keymaps (which-key)",
		},
	},
}
