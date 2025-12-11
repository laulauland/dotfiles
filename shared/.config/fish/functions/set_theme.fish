function set_theme
	if test -z "$argv"
		echo "Please provide theme name as an argument"
		return 1
	end

	if test -f $XDG_CONFIG_HOME/fish/colors/$argv[1].fish
		fish $XDG_CONFIG_HOME/fish/colors/$argv[1].fish
	end
end
