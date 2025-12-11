return {
	{
		"lewis6991/gitsigns.nvim",
		config = function()
			require("gitsigns").setup()
		end
	},
	{
		"tpope/vim-fugitive",
	},
	{
		"tpope/vim-rhubarb",
	},
	{
		'fredeeb/tardis.nvim',
		config = function()
			require('tardis-nvim').setup()
		end
	}
}
