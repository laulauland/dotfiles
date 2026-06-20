{ ... }:

{
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "no";
    };
  };

  networking.firewall = {
    enable = true;
    allowedTCPPorts = [
      22
    ];
  };
}
