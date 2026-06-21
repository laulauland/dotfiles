{ hermes-agent, pkgs, ... }:

let
  hermes = hermes-agent.packages.${pkgs.system}.messaging;
in
{
  systemd.services.hermes-gateway = {
    description = "Hermes Agent Gateway - Messaging Platform Integration";
    wantedBy = [ "multi-user.target" ];
    wants = [ "network-online.target" ];
    after = [
      "network-online.target"
      "tailscaled.service"
    ];
    unitConfig.StartLimitIntervalSec = 0;

    path = with pkgs; [
      bash
      coreutils
      git
      openssh
      ripgrep
    ];

    environment = {
      HOME = "/home/laurynas";
      HERMES_HOME = "/home/laurynas/.hermes";
      HERMES_ACCEPT_HOOKS = "1";
      LOGNAME = "laurynas";
      USER = "laurynas";
      VIRTUAL_ENV = "${hermes}";
    };

    serviceConfig = {
      Type = "simple";
      User = "laurynas";
      Group = "users";
      WorkingDirectory = "/home/laurynas/.hermes";
      ExecStart = "${hermes}/bin/hermes gateway run --replace --accept-hooks";
      ExecReload = "${pkgs.coreutils}/bin/kill -USR1 $MAINPID";
      Restart = "always";
      RestartForceExitStatus = 75;
      RestartSec = "5s";
      KillMode = "mixed";
      KillSignal = "SIGTERM";
      TimeoutStopSec = "210s";
    };
  };
}
