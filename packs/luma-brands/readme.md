# Luma brands pack

Example `.icnl` icon pack: the nine brand tiles that LumiOS inherited from Luma, as SVG logos plus the CSS backgrounds they use on Home.

Build it from the repository root:

```sh
pnpm icnl pack packs/luma-brands
```

Output: `dist/luma-brands.icnl`. Push it to a TV registered with `ares-setup-device`:

```sh
pnpm icnl push dist/luma-brands.icnl --device tv
```

Logos belong to their respective owners; see `assets.md` at the repository root.
