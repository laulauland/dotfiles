local function toggle_term()
	for _, buffer in ipairs(vim.api.nvim_list_bufs()) do
		local buffer_name = vim.api.nvim_buf_get_name(buffer)
		if string.sub(buffer_name, 1, 7) == "term://" then
			vim.api.nvim_win_set_buf(0, buffer)
			return
		end
	end
	vim.api.nvim_command(":terminal")
end

require("utils").set_keymaps({
	n = {
		["<leader>t"] = { "<cmd>terminal<cr>", desc = "Create Terminal" },
		["<C-`>"] = { "<cmd>terminal<cr>", desc = "Create Terminal" },
		["<S-Esc>"] = { function() toggle_term() end, desc = "Toggle Terminal" },
	},
	t = {
		-- ["<S-Esc>"] = { "<cmd>q<cr>", desc = "Toggle Terminal" },
		["<Esc><Esc>"] = { "<C-\\><C-n>" },
		["<C-d>"] = { "<C-\\><C-n><C-d>zzA" },
		["<C-u>"] = { "<C-\\><C-n><C-u>zzA" },
		["<C-i>"] = { "<C-\\><C-n><C-i>zz" },
		["<C-o>"] = { "<C-\\><C-n><C-o>zz" },
		["<Tab>"] = { "<Tab>" },
		["<C-^>"] = { "<C-\\><C-n><C-^>" },
		["<C-Tab>"] = { "<C-\\><C-n><C-^>" },
	}
})
