function show_deps --wraps=jq\ \'\{\n\ \ dependencies:\ \(.dependencies\ //\ \{\}\),\n\ \ devDependencies:\ \(.devDependencies\ //\ \{\}\),\n\ \ peerDependencies:\ \(.peerDependencies\ //\ \{\}\),\n\ \ optionalDependencies:\ \(.optionalDependencies\ //\ \{\}\)\n\}\'\ package.json --description alias\ show_deps=jq\ \'\{\n\ \ dependencies:\ \(.dependencies\ //\ \{\}\),\n\ \ devDependencies:\ \(.devDependencies\ //\ \{\}\),\n\ \ peerDependencies:\ \(.peerDependencies\ //\ \{\}\),\n\ \ optionalDependencies:\ \(.optionalDependencies\ //\ \{\}\)\n\}\'\ package.json
  jq '{
  dependencies: (.dependencies // {}),
  devDependencies: (.devDependencies // {}),
  peerDependencies: (.peerDependencies // {}),
  optionalDependencies: (.optionalDependencies // {})
}' package.json $argv
        
end
