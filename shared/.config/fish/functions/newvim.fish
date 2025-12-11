function newvim --wraps='nvim -u ~/.config/nvim2/init.lua' --description 'alias newvim=nvim -u ~/.config/nvim2/init.lua'
  nvim -u ~/.config/nvim2/init.lua $argv;
end
