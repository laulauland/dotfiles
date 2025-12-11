function tc --wraps='tmux -CC' --description 'alias tc=tmux -CC'
  tmux -CC $argv; 
end
