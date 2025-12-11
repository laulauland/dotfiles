function ! --description 'Set terminal background color - random flavor'
  set -l colors \
    '32/2c/29' \
    '1e/28/3a' \
    '2d/1e/3a' \
    '3a/2e/1e' \
    '1e/3a/35'

  set -l index (random 1 (count $colors))
  set -l chosen_color $colors[$index]
  echo -e "\e]11;rgb:$chosen_color\a"
end