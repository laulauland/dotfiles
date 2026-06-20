{
  description = "Laurynas' NixOS hosts";

  inputs = {
    determinate.url = "https://flakehub.com/f/DeterminateSystems/determinate/*";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0";

    home-manager = {
      url = "github:nix-community/home-manager/release-26.05";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    hermes-agent = {
      url = "github:NousResearch/hermes-agent";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pi = {
      url = "github:lukasl-dev/pi.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      determinate,
      disko,
      hermes-agent,
      home-manager,
      nixpkgs,
      pi,
      ...
    }:
    {
      nixosConfigurations =
        let
          shireModules = [
            determinate.nixosModules.default
            home-manager.nixosModules.home-manager
            ./nixos/hosts/shire/configuration.nix
          ];
        in
        {
          shire = nixpkgs.lib.nixosSystem {
            system = "x86_64-linux";
            specialArgs = {
              inherit hermes-agent home-manager pi;
            };
            modules = shireModules;
          };

          shire-install = nixpkgs.lib.nixosSystem {
            system = "x86_64-linux";
            specialArgs = {
              inherit hermes-agent home-manager pi;
            };
            modules = shireModules ++ [
              disko.nixosModules.disko
              ./nixos/hosts/shire/disko.nix
            ];
          };
        };
    };
}
