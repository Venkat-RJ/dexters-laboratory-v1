#!/usr/bin/env bash
# Build and run Dexter's Laboratory from source. No sudo or shell-profile edits.
set -euo pipefail

case "${1:-}" in
  --help|-h)
    echo 'Usage: ./scripts/setup.sh [--no-run]'
    echo 'macOS: prepare pinned tools and dependencies, then launch the desktop app.'
    echo '--no-run prepares dependencies without launching the app.'
    exit 0 ;;
  ''|--no-run) ;;
  *) echo "Unknown option: $1. Use --help." >&2; exit 1 ;;
esac
if (( $# > 1 )); then echo 'Use --help for supported options.' >&2; exit 1; fi
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This setup command currently supports macOS 14 or later.' >&2
  exit 1
fi
if (( $(sw_vers -productVersion | cut -d. -f1) < 14 )); then
  echo 'Dexter requires macOS 14 or later.' >&2; exit 1
fi
if ! xcode-select -p >/dev/null 2>&1 || ! xcrun --find clang >/dev/null 2>&1; then
  echo 'Install Apple Command Line Tools with: xcode-select --install' >&2
  echo 'Finish that installation, then run this command again.' >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
export PATH="$HOME/.cargo/bin:$PATH"
download_dir=''
trap 'if [[ -n "$download_dir" ]]; then rm -rf "$download_dir"; fi' EXIT

if ! command -v rustup >/dev/null 2>&1; then
  echo 'Installing rustup locally without changing your shell profile...'
  download_dir="$(mktemp -d)"
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$download_dir/rustup.sh"
  sh "$download_dir/rustup.sh" -y --profile minimal --no-modify-path --default-toolchain none
fi
echo 'Preparing the Rust toolchain from rust-toolchain.toml...'
rustup toolchain install

# A checksum-verified mise bootstraps Node and pnpm from mise.toml. Do not use
# whichever pnpm happens to be on PATH: newer majors interpret patches differently.
mise_version=v2026.8.8
case "$(uname -m)" in
  arm64) architecture=arm64 ;;
  x86_64) architecture=x64 ;;
  *) echo 'Unsupported Mac architecture.' >&2; exit 1 ;;
esac
mise_bin="$root/.source-tools/mise"
if [[ ! -x "$mise_bin" ]] || ! "$mise_bin" --version | grep -Fq "${mise_version#v}"; then
  echo 'Downloading the pinned tool manager...'
  if [[ -n "$download_dir" ]]; then rm -rf "$download_dir"; fi
  download_dir="$(mktemp -d)"
  archive="mise-$mise_version-macos-$architecture.tar.gz"
  base="https://github.com/jdx/mise/releases/download/$mise_version"
  curl --proto '=https' --tlsv1.2 -fsSL "$base/$archive" -o "$download_dir/$archive"
  curl --proto '=https' --tlsv1.2 -fsSL "$base/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
  (
    cd "$download_dir"
    awk -v archive="$archive" '$2 == archive || $2 == "./" archive { print $1 "  " archive }' SHASUMS256.txt > checksum.txt
    [[ -s checksum.txt ]] || { echo 'Missing tool-manager checksum.' >&2; exit 1; }
    shasum -a 256 --check checksum.txt
    tar -xzf "$archive"
  )
  mkdir -p "$root/.source-tools"
  install -m 0755 "$download_dir/mise/bin/mise" "$mise_bin"
fi
echo 'Preparing Node and pnpm from mise.toml...'
"$mise_bin" trust "$root/mise.toml"
"$mise_bin" install
"$mise_bin" exec -- node scripts/setup-source.mjs "$@"
