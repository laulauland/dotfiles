function show_scripts --wraps='cat package.json | jq ".scripts"' --description 'alias show_scripts=cat package.json | jq ".scripts"'
  cat package.json | jq ".scripts" $argv
        
end
