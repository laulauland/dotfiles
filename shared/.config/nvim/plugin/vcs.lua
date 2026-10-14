require("gitsigns").setup({
	on_attach = function(buf)
		local gs = require("gitsigns")
		local map = function(lhs, rhs, desc) vim.keymap.set("n", lhs, rhs, { buffer = buf, desc = desc }) end

		map("]c", function()
			if vim.wo.diff then return vim.cmd.normal({ "]c", bang = true }) end
			gs.nav_hunk("next")
		end, "Next hunk")
		map("[c", function()
			if vim.wo.diff then return vim.cmd.normal({ "[c", bang = true }) end
			gs.nav_hunk("prev")
		end, "Previous hunk")
		map("<leader>Gp", gs.preview_hunk_inline, "Preview hunk")
		map("<leader>Gr", gs.reset_hunk, "Reset hunk")
		map("<leader>Gb", function() gs.blame_line({ full = true }) end, "Blame line")
		map("<leader>GB", gs.blame, "Blame file")
	end,
})

-- jj-review.nvim is a local checkout, not a vim.pack plugin.
local root = vim.env.JJ_REVIEW_NVIM_DIR or vim.fn.expand("~/code/laulauland/jj-review")
if vim.uv.fs_stat(root) then
	vim.opt.rtp:append(root)
	local built_binary = root .. "/zig-out/bin/jj-review"
	require("jj-review").setup({
		binary = vim.env.JJ_REVIEW_BINARY or (vim.fn.executable(built_binary) == 1 and built_binary or "jj-review"),
	})

	vim.keymap.set("n", "<leader>cr", function() require("jj-review").toggle() end, { desc = "Toggle review buffer" })
	vim.keymap.set("n", "<leader>cR", function() require("jj-review").refresh() end, { desc = "Refresh review comments" })
	-- `:.JJReview add` anchors to the cursor line; in visual mode a leading `:`
	-- inserts `'<,'>`, so the comment anchors to the selection.
	-- (<leader>ca is LSP code action; review comment is <leader>cm.)
	vim.keymap.set("n", "<leader>cm", ":.JJReview add<CR>", { desc = "Add review comment on line" })
	vim.keymap.set("x", "<leader>cm", ":JJReview add<CR>", { desc = "Add review comment on selection" })
end
