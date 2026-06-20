{ pkgs, ... }:

{
  users.users.laurynas = {
    isNormalUser = true;
    description = "Laurynas Keturakis";
    extraGroups = [
      "wheel"
    ];
    shell = pkgs.fish;
  };

  security.sudo.wheelNeedsPassword = false;
}
