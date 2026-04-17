return {
	{
		"jceb/jiejie.nvim",
	},
	{
		"lewis6991/gitsigns.nvim",
		config = function()
			require("gitsigns").setup()
		end,
	},
	{
		"evanphx/jjsigns.nvim",
		config = function()
			require("jjsigns").setup()
		end
	}
}
