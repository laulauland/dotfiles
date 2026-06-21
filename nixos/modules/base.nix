{ hermes-agent, lib, pi, pkgs, ... }:

{
  nixpkgs.config.allowUnfreePredicate = pkg: builtins.elem (lib.getName pkg) [
    "claude-code"
    "codex"
  ];

  nix.settings = {
    experimental-features = [
      "nix-command"
      "flakes"
    ];
    extra-substituters = [
      "https://pi.cachix.org"
    ];
    extra-trusted-public-keys = [
      "pi.cachix.org-1:lGeoGJaZ5ZDabuRzkcD5EBTNnDM4HJ1vqeOxlWk1Flk="
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
  programs.mosh.enable = true;

  environment.shells = [
    pkgs.fish
  ];

  environment.systemPackages = with pkgs; [
    bat
    claude-code
    codex
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
    pi.packages.${pkgs.system}.coding-agent
    ripgrep
    starship
    tmux
    zoxide
    hermes-agent.packages.${pkgs.system}.messaging
  ];
}
