return {
	{
		"supermaven-inc/supermaven-nvim",
		config = function()
			require("supermaven-nvim").setup({
				log_level = "warn",
				keymaps = {
					accept_suggestion = "<C-y>",
					clear_suggestion = "<C-e>",
				},
				-- color = {
				-- 	suggestion_color = "#6e6a86",
				-- 	cterm = 8,
				-- },
			})
		end,
	},
	-- {
	--   "olimorris/codecompanion.nvim",
	--   config = function()
	--     local get_api_key_cmd = function()
	--       if vim.fn.has("mac") == 1 then
	--         return "cmd:security find-generic-password -l ANTHOPIC_API_KEY -w"
	--       end
	--
	--       if vim.fn.has("linux") == 1 then
	--         return "cmd:secret-tool lookup api_key anthropic"
	--       end
	--     end
	--
	--     local anthropic_adapter =
	--       require("codecompanion.adapters").extend("anthropic", {
	--         env = {
	--           api_key = get_api_key_cmd(),
	--         },
	--       })
	--
	--     require("codecompanion").setup({
	-- 		log_level = "TRACE",
	--       send_code = true,
	--       adapters = {
	--         anthropic = anthropic_adapter,
	--       },
	--       strategies = {
	--         chat = {
	--           adapter = "anthropic",
	--         },
	--         inline = {
	--           adapter = "anthropic",
	--           keymaps = {
	--             accept_change = {
	--               modes = {
	--                 [{ "n", "v" }] = "<CR>",
	--               },
	--             },
	--             reject_change = {
	--               modes = {
	--                 [{ "n", "v" }] = "<Esc>",
	--               },
	--             },
	--           },
	--         },
	--       },
	--       agent = {
	--         adapter = "anthropic",
	--       },
	--     })
	--
	--     require("utils").set_keymaps({
	--       [{ "n", "v" }] = {
	--         ["<leader><C-k>"] = {
	--           "<cmd>CodeCompanion<CR>",
	--           desc = "CodeCompanion",
	--         },
	--         ["<leader><C-l>"] = {
	--           "<cmd>CodeCompanionChat<CR>",
	--           desc = "CodeCompanion",
	--         },
	--       },
	--       v = {
	--         ["<leader><C-l>"] = {
	--           "<cmd>CodeCompanionChat<CR>,CodeCompanionAdd<CR>",
	--           desc = "CodeCompanion",
	--         },
	--       },
	--     })
	--
	--     vim.cmd([[cab cc CodeCompanion]])
	--   end,
	-- },
}
