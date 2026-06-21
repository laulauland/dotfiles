{ pkgs, ... }:

{
  imports = [
    ./hardware-configuration.nix
    ../../modules/base.nix
    ../../modules/hermes-gateway.nix
    ../../modules/hetzner-cloud.nix
    ../../modules/ssh.nix
    ../../modules/tailscale.nix
    ../../modules/users.nix
    ../../modules/home-manager.nix
  ];

  networking.hostName = "shire";
  networking.usePredictableInterfaceNames = false;
  networking.interfaces.eth0.useDHCP = true;

  networking.interfaces.eth0.ipv6.addresses = [
    {
      address = "2a01:4f8:1c18:abc2::1";
      prefixLength = 64;
    }
  ];

  networking.defaultGateway6 = {
    address = "fe80::1";
    interface = "eth0";
  };

  networking.nameservers = [
    "185.12.64.2"
    "185.12.64.1"
    "2606:4700:4700::1111"
    "2606:4700:4700::1001"
    "2620:fe::fe"
  ];

  fileSystems."/" = {
    device = "/dev/disk/by-partlabel/disk-main-root";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-partlabel/disk-main-esp";
    fsType = "vfat";
    options = [
      "umask=0077"
    ];
  };

  swapDevices = [
    {
      device = "/swapfile";
      size = 4096;
    }
    {
      device = "/swapfile-build";
      size = 4096;
    }
  ];

  boot.loader.grub.devices = [
    "/dev/sda"
  ];

  users.users.laurynas.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDPClqrUAPyjq8nSCXdyUZpo7DQfcnwZ1+0yNEFAgzZI lau-main"
  ];

  environment.systemPackages = with pkgs; [
    curl
    git
    helix
    htop
    jq
    lsof
    rsync
    tree
    unzip
    wget
  ];

  system.stateVersion = "26.05";
}
