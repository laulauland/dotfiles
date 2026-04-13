local root = vim.env.JJ_REVIEW_NVIM_DIR or vim.fn.expand("~/code/laulauland/jj-review")
local built_binary = root .. "/zig-out/bin/jj-review"
local binary = vim.env.JJ_REVIEW_BINARY or (vim.fn.executable(built_binary) == 1 and built_binary or "jj-review")

return {
	{
		dir = root,
		name = "jj-review.nvim",
		lazy = false,
		cond = function()
			return (vim.uv or vim.loop).fs_stat(root) ~= nil
		end,
		config = function()
			require("jj-review").setup({
				binary = binary,
			})

			require("utils").set_keymaps({
				n = {
					["<leader>cr"] = {
						function() require("jj-review").toggle() end,
						desc = "Toggle review buffer",
					},
					["<leader>cR"] = {
						function() require("jj-review").refresh() end,
						desc = "Refresh review comments",
					},
				},
			})
		end,
	},
}
