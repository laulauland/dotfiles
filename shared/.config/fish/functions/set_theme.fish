function set_theme
	if test -z "$argv"
		echo "Please provide theme name as an argument"
		return 1
	end

	set -l colors_dir ~/.config/fish/colors
	if test -f $colors_dir/$argv[1].fish
		source $colors_dir/$argv[1].fish
		echo "Applied theme: $argv[1]"
	else
		echo "Theme not found: $colors_dir/$argv[1].fish"
		return 1
	end
end
