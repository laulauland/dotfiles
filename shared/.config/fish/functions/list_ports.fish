function list_ports --wraps=lsof\ -n\ -i\ -P\ \|\ grep\ \'LISTEN\' --description alias\ list_ports=lsof\ -n\ -i\ -P\ \|\ grep\ \'LISTEN\'
  lsof -n -i -P | grep 'LISTEN' $argv
        
end
