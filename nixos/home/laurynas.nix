{ config, pkgs, ... }:

let
  repoRoot = ../..;
  shared = repoRoot + "/shared";
in
{
  home.username = "laurynas";
  home.homeDirectory = "/home/laurynas";
  home.stateVersion = "26.05";

  home.packages = with pkgs; [
    atuin
    bun
    cargo
    coreutils
    fnm
    gh
    mise
    nodejs
    pnpm
  ];

  home.file = {
    ".config/fish/colors".source = shared + "/.config/fish/colors";
    ".config/fish/completions".source = shared + "/.config/fish/completions";
    ".config/fish/config.fish".source = shared + "/.config/fish/config.fish";
    ".config/fish/functions".source = shared + "/.config/fish/functions";
    ".config/ghostty".source = shared + "/.config/ghostty";
    ".config/jj/config.toml".source = shared + "/.config/jj/config.toml";
    ".config/nvim".source = shared + "/.config/nvim";
    ".config/ripgrep".source = shared + "/.config/ripgrep";
    ".config/starship.toml".source = shared + "/.config/starship.toml";
    ".config/tmux".source = shared + "/.config/tmux";
    ".gitconfig".source = shared + "/.gitconfig";
    ".gitconfig-os".text = ''
      [credential "https://github.com"]
      	helper =
      	helper = !${pkgs.gh}/bin/gh auth git-credential
      [credential "https://gist.github.com"]
      	helper =
      	helper = !${pkgs.gh}/bin/gh auth git-credential
    '';
    ".gitconfig-work".source = shared + "/.gitconfig-work";
    ".local/bin".source = shared + "/.local/bin";
    ".ssh/rc".source = shared + "/.ssh/rc";
  };

  programs.home-manager.enable = true;
}
