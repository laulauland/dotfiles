return {
	"jiaoshijie/undotree",
	dependencies = "nvim-lua/plenary.nvim",
	config = true,
	keys = {
		{ "<leader>u", function()
			require('undotree').toggle()
		end },
	},
}
