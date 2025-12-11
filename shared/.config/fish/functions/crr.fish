function crr --wraps='cargo run --release' --description 'alias crr=cargo run --release'
  cargo run --release $argv; 
end
