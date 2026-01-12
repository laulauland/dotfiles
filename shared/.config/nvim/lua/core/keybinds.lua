require("utils").set_keymaps(
	{
		[{ "n", "v" }] = {
			["gh"] = {
				"^",
				desc = "Go to: beginning of the line (non-whitespace char)",
			},
			["gl"] = { "$", desc = "Go to: end of the line" },
		},
		[{ "n", "x" }] = {
			["c"] = { '"_c' },
			["s"] = { '"_s' },
		},
		t = {
			["<Esc><Esc>"] = { "<C-\\><C-n>" },
			["<C-d>"] = { "<C-\\><C-n><C-d>zzA" },
			["<C-u>"] = { "<C-\\><C-n><C-u>zzA" },
			["<C-i>"] = { "<C-\\><C-n><C-i>zz" },
			["<C-o>"] = { "<C-\\><C-n><C-o>zz" },
			["<Tab>"] = { "<Tab>" },
			["<C-^>"] = { "<C-\\><C-n><C-^>" },
			["<C-Tab>"] = { "<C-\\><C-n><C-^>" },
		},
		[{ "n", "t" }] = {
			["<C-q>"] = { "<cmd>q<CR>", desc = "Quit" },

		},
		n = {
			["[t"] = { "<cmd>tabprev<CR>", desc = "Previous tab" },
			["]t"] = { "<cmd>tabnext<CR>", desc = "Next tab" },
			["[b"] = { "<cmd>bprev<CR>", desc = "Previous buffer" },
			["]b"] = { "<cmd>bnext<CR>", desc = "Next buffer" },

			["<leader>J"] = { "<cmd>cnext<CR>", desc = "Next in quickfix list" },
			["<leader>K"] = { "<cmd>cprev<CR>", desc = "Previous in quickfix list" },
			["<leader>co"] = { "<cmd>copen<CR>", desc = "Open quickfix list" },
			["<leader>cc"] = { "<cmd>cclose<CR>", desc = "Close quickfix list" },

			-- ["]c"] = {
			--     function()
			--         if vim.wo.diff then
			--             vim.cmd.normal({ "]c", bang = true })
			--         else
			--             gitsigns.nav_hunk("next")
			--         end
			--     end,
			-- },
			--
			-- ["[c"] = {
			--     function()
			--         if vim.wo.diff then
			--             vim.cmd.normal({ "[c", bang = true })
			--         else
			--             gitsigns.nav_hunk("prev")
			--         end
			--     end,
			-- },

			-- ["<leader>Ga"] = { gitsigns.stage_hunk, desc = "Stage current file" },
			-- ["<leader>Gb"] = {
			--     function() gitsigns.blame_line({ full = true }) end,
			--     desc = "Blame current line",
			-- },
			-- ["<leader>Gg"] = {
			--     "<cmd>vertical Git<CR><CR>",
			--     desc = "Open Git status (in vertical)",
			-- },

			-- ["<C-t>"] = { function() toggle_term() end, desc = "Open Terminal" },
			-- ["<leader>t"] = { function() toggle_term() end, desc = "Open Terminal" },
			["<leader>w"] = { "<cmd>w<CR>", desc = "Save" },
			["<leader>x"] = { "<cmd>bdelete<CR>", desc = "Kill buffer" },
			["<leader>q"] = { "<cmd>q<CR>", desc = "Quit" },
			["<leader>Q"] = { "<cmd>qa<CR>", desc = "Quit all" },
			["<ESC>"] = {
				":nohlsearch<Bar>:echo<CR>",
				desc = "Remove search highlights",
			},
			["<C-Tab>"] = { "<C-^>" },
			["<leader>/"] = {
				function() vim.api.nvim_input("gcc") end,
				desc = "Toggle comment line",
			},
			-- always center the viewport after executing vertical movement
			["<C-d>"] = { "<C-d>zz" },
			["<C-u>"] = { "<C-u>zz" },
			["<C-i>"] = { "<C-i>zz" },
			["<C-o>"] = { "<C-o>zz" },
			["{"] = { "{zz" },
			["}"] = { "}zz" },
			["#"] = { "#zz" },
			["%"] = { "%zz" },
			["*"] = { "*zz" },
			["gg"] = { "ggzz" },
			["G"] = { "Gzz" },
			["n"] = { "nzzzv" },
			["N"] = { "Nzzzv" },
			["J"] = { "mzJ`z" },

			["S"] = {
				function()
					local cmd = ":%s/<C-r><C-w>/<C-r><C-w>/gI<Left><Left><Left>"
					local keys =
							vim.api.nvim_replace_termcodes(cmd, true, false, true)
					vim.api.nvim_feedkeys(keys, "n", false)
				end,
				desc = "Quick find/replace for the word under the cursor",
			},

			-- SPLITS
			["<leader>v"] = { ":vsplit<CR>", desc = "Split vertically" },
			["<leader>h"] = { ":split<CR>", desc = "Split horizontally" },

			-- ["<leader>U"] = {
			--     function() require("undotree").toggle() end,
			--     desc = "Search Undo",
			-- },


			["<leader>uw"] = {
				function()
					if vim.g.whitespace == true then
						vim.opt.listchars = {
							tab = "› ",
							eol = "¬",
							extends = "⟩",
							precedes = "⟨",
							trail = "·",
							space = "·",
							nbsp = "⋅",
						}
						vim.g.whitespace = false
					else
						vim.opt.listchars = {
							tab = "  ",
							eol = "¬",
							trail = "·",
						}
						vim.g.whitespace = true
					end
				end,
				desc = "Toggle whitespace",
			},
			["<leader>="] = { "<C-w>=", desc = "Equally high and wide" },
			-- move lines
			-- ["∆"] = { ":m +1<CR>==" },
			-- ["˚"] = { ":m -2<CR>==" },
		},
		v = {
			["J"] = { ":m '>+1<CR>gv=gv" },
			["K"] = { ":m '<-2<CR>gv=gv" },
			["-"] = { "<c-x>", desc = "Descrement number" },
			["+"] = { "<c-a>", desc = "Increment number" },
			["<"] = { "<gv" },
			[">"] = { ">gv" },
			["p"] = { '"_dP' },
			["P"] = { '"_dP' },
			["<leader>/"] = {
				function() vim.api.nvim_input("gc") end,
				desc = "Toggle comment line",
			},
		},
		x = {
			["p"] = { "P" },
			["P"] = { "p" },
		},
		c = {
			["<C-a>"] = { "<Home>" },
			["<C-f>"] = { "<right>" },
			["<C-b>"] = { "<left>" },
		},
		i = {
			["<C-h>"] = false,
			["<C-b>"] = { "<left>" },
			["<C-e>"] = { "<C-o>A" },
			["<C-f>"] = { "<right>" },
			["<C-a>"] = { "<C-o>I" },
			["<C-j>"] = { "<Nop>" },
			["<C-k>"] = {
				function() vim.lsp.buf.signature_help() end,
				desc = "Show function signature",
			},
			["<C-p>"] = { "<C-o>k" },
			["<C-n>"] = { "<C-o>j" },
		},
	}
)

-- LSP keymaps using LspAttach autocmd
vim.api.nvim_create_autocmd("LspAttach", {
	callback = function(args)
		require("utils").set_keymaps({
			n = {
				["gd"] = {
					function()
						require("telescope.builtin").lsp_definitions()
					end,
					desc = "Go to declaration",
					buffer = args.buf
				},
				["gD"] = {
					function()
						require("telescope.builtin").lsp_type_definitions()
					end,
					desc = "Go to declaration",
					buffer = args.buf
				},
				["gr"] = {
					function()
						require("telescope.builtin").lsp_references()
					end,
					desc = "Go to references",
					buffer = args.buf
				},
				["<F12>"] = {
					function()
						require("telescope.builtin").lsp_references()
					end,
					desc = "Go to references",
					buffer = args.buf
				},
				["gi"] = { function() require("telescope.builtin").lsp_implementations() end, desc = "Go to implementation", buffer = args.buf },
				["K"] = { vim.lsp.buf.hover, desc = "Show hover", buffer = args.buf },
				["<leader>r"] = { vim.lsp.buf.rename, desc = "Rename symbol", buffer = args.buf },
				["<leader>F"] = { vim.lsp.buf.format, desc = "Format", buffer = args.buf },
				["[d"] = { vim.diagnostic.goto_prev, desc = "Previous diagnostic", buffer = args.buf },
				["]d"] = { vim.diagnostic.goto_next, desc = "Next diagnostic", buffer = args.buf },
				["<leader>d"] = { vim.diagnostic.open_float, desc = "Show diagnostic", buffer = args.buf },
			},
			[{ "n", "v" }] = {
				["<leader>ca"] = { vim.lsp.buf.code_action, desc = "Code action", buffer = args.buf },
			},
		})
	end,
})
