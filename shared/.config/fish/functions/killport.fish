function killport --wraps='kill $(lsof -t -i:$argv)' --description 'alias killport=kill $(lsof -t -i:$argv)'
  kill $(lsof -t -i:$argv) 
end
