return {
	"laytan/cloak.nvim",
	config = function()
		require("cloak").setup({
			patterns = {
				{
					file_pattern = ".dev.vars*",
					cloak_pattern = '=.+',
					replace = nil,
				},
			},
		})
	end
}
