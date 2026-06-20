{ pkgs, ... }:

{
  nix.settings = {
    experimental-features = [
      "nix-command"
      "flakes"
    ];
    trusted-users = [
      "root"
      "@wheel"
    ];
  };

  time.timeZone = "Europe/Amsterdam";

  i18n.defaultLocale = "en_US.UTF-8";

  console = {
    keyMap = "us";
  };

  programs.fish.enable = true;

  environment.shells = [
    pkgs.fish
  ];

  environment.systemPackages = with pkgs; [
    bat
    difftastic
    direnv
    eza
    fd
    fish
    fzf
    gh
    git
    jujutsu
    mergiraf
    neovim
    ripgrep
    starship
    tmux
    zoxide
  ];
}
