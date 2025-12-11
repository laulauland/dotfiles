return {
	"rose-pine/neovim",
	name = "rose-pine",
	lazy = false,   -- make sure we load this during startup if it is your main colorscheme
	priority = 1000, -- make sure to load this before all the other start plugins
	config = function()
		require("rose-pine").setup({
			variant = "auto",
			dim_inactive_windows = true,
			extend_background_behind_borders = true,

			styles = {
				italic = false,
				transparency = false,
			},

			groups = {
				border = "text",
			},

			highlight_groups = {

				-- Syntax resets, toning down on colors and making operators more prominent

				TSDefinition = { bg = "highlight_high" },

				Keyword = { fg = "muted" },
				["@keyword.return"] = { fg = "pine" },
				["@keyword.coroutine"] = { fg = "pine" },
				["@keyword.exception"] = { fg = "pine" },

				Type = { fg = "text" },
				["@type"] = { fg = "text" },
				["@type.builtin"] = { fg = "text", bold = true },

				Property = { fg = "text" },

				Macro = { fg = "iris" },
				["@constant.macro"] = { fg = "iris" },

				Comment = { fg = "foam" },

				["@variable"] = { fg = "text" },
				["@variable.member"] = { fg = "text" },

				["@number"] = { fg = "rose" },
				["@number.float"] = { fg = "rose" },

				["@string.special.symbol"] = { fg = "rose" },
				["@string.special.path"] = { fg = "iris" },

				["@constructor"] = { fg = "text" },
				["@property"] = { fg = "text" },
				["@property_identifier"] = { fg = "highlight_high" },

				["@parameter"] = { fg = "highlight_medium" },

				["@function.builtin"] = { fg = "pine" },
				["@variable.builtin"] = { fg = "pine" },
				["@constant.builtin"] = { fg = "pine" },
				Tag = { fg = "subtle" },
				["@tag"] = { fg = "subtle" },
				["@tag.attribute"] = { fg = "foam" },

				Operator = { fg = "love" },
				["@punctuation.special"] = { fg = "love" },

				NormalFloat = { fg = "text", bg = "NONE" },
				FloatBorder = { fg = "text", bg = "NONE" },
				TelescopeBorder = { fg = "subtle", bg = "None" },
				TelescopeNormal = { fg = "text", bg = "None" },
				TelescopePromptTitle = { fg = "text", bg = "NONE" },
				TelescopePromptBorder = { fg = "text", bg = "NONE" },
				TelescopePromptPrefix = { fg = "text", bg = "NONE" },
				TelescopePromptNormal = { fg = "text", bg = "NONE" },
				TelescopeResultsNormal = { fg = "text", bg = "NONE" },
				TelescopePreviewNormal = { fg = "text", bg = "NONE" },
				WhichKeyFloat = { fg = "text", bg = "base" },
				WhichKeyBorder = { fg = "subtle", bg = "base" },
				HarpoonBorder = { fg = "subtle", bg = "base" },
				HarpoonWindow = { fg = "text", bg = "base" },
				VertSplit = { fg = "text", bg = "base" },
				NonText = { fg = "highlight_high", bg = "NONE" },
				VirtNonText = { fg = "muted", bg = "base" },
				LspInlayHint = { fg = "muted", bg = "base" },

				DiagnosticLineHlError = { bg = "love", blend = 10 },
				DiagnosticLineHlWarn = { bg = "gold", blend = 10 },
				DiagnosticLineHlInfo = { bg = "foam", blend = 10 },
				DiagnosticLineHlHint = { bg = "iris", blend = 10 },
			},
		}
		)
		-- vim.cmd([[colorscheme rose-pine]])
	end,
}
