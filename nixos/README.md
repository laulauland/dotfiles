# NixOS hosts

This directory manages NixOS machines. It is separate from the stow flow:

- macOS uses `./stow`, which links `shared/` and `macos/`.
- Arch hosts such as `rohan` use `./stow`, which links `shared/` and `arch/`.
- NixOS uses `./nixos/switch`, which infers the host and runs
  `nixos-rebuild --flake .#<host> switch`.

The first NixOS host is `shire`, a Hetzner machine. The existing Arch host
`rohan` remains stow-managed.

## Determinate Nix

The flake imports Determinate Systems' NixOS module:

```nix
determinate.nixosModules.default
```

Determinate Nix is part of the installed NixOS system. It does not replace
`nixos-anywhere` for Hetzner's stock-image/Rescue install path: `nixos-anywhere`
handles SSH, kexec, Disko partitioning, hardware config generation, and the
initial NixOS install.

For the first switch on a host that does not already have Determinate Nix's
binary cache configured, run:

```bash
./nixos/switch --bootstrap
```

After that, use:

```bash
./nixos/switch
```

## Initial `shire` setup

Hetzner Cloud does not need to boot a custom NixOS image. Create the server
with a stock Linux image, enable Rescue mode in Hetzner, reboot, and confirm
root SSH works:

```bash
ssh root@<shire-ip>
```

Then install from your Mac or another machine with Nix:

```bash
./nixos/install-shire root@<shire-ip>
```

This uses `nixos-anywhere` over SSH. It will kexec into a NixOS installer,
partition and format the target disk with Disko, generate hardware config, and
install `.#shire`.

The Disko layout defaults to `/dev/sda`, which matches the common Hetzner Cloud
layout used by the `nixos-anywhere` quickstart. If Hetzner gives this machine a
different root disk, check with `lsblk` in Rescue mode and adjust:

```text
nixos/hosts/shire/disko.nix
```

Before installing, add your SSH public key in:

```text
nixos/hosts/shire/configuration.nix
```

Tailscale is installed and enabled by the system config. After the first boot,
SSH over the public address once and authenticate the machine:

```bash
sudo tailscale up
```

After that, connect over the tailnet:

```bash
ssh laurynas@shire
```

For the current uncommitted working tree, copy the repo directly from this Mac
to `shire` and switch there:

```bash
./nixos/copy-to-shire
```

That creates `/home/laurynas/Code/laulauland/dotfiles` on `shire`, copies this
working tree there, and runs `./nixos/switch` on the host.

Once the repo state is committed and pushed, `shire` can manage itself:

```bash
ssh laurynas@shire
cd ~/Code/laulauland/dotfiles
./nixos/switch
```

For a fresh `shire` checkout from GitHub, run this on the host:

```bash
curl -fsSL https://raw.githubusercontent.com/laulauland/dotfiles/main/nixos/bootstrap-self | bash
```

If the checkout does not yet have `flake.lock`, the first rebuild will create
one. Commit it after the first successful switch.
