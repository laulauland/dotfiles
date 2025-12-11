function nv --wraps='nvim "+Telescope find_files"' --description 'alias nv=nvim "+Telescope find_files"'
  nvim "+Telescope find_files" $argv; 
end
