function tca --wraps='tmux -CC attach' --description 'alias tca=tmux -CC attach'
  tmux -CC attach $argv; 
end
