function yoink --wraps='open -a Yoink' --wraps='open -a Dropover' --description 'alias yoink=open -a Dropover'
  open -a Dropover $argv; 
end
