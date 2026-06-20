{ pkgs, ... }:

{
  services.tailscale = {
    enable = true;
    openFirewall = true;
    extraSetFlags = [
      "--accept-dns=false"
    ];
  };

  networking.firewall.trustedInterfaces = [
    "tailscale0"
  ];

  environment.systemPackages = [
    pkgs.tailscale
  ];
}
