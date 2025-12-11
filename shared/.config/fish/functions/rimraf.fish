function rimraf --wraps='rm -rf' --description 'alias rimraf=rm -rf'
  rm -rf $argv; 
end
