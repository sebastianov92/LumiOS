# Gradients pack

Three CSS-only Home backgrounds (no images): Flow, Ember and Ocean. A wallpaper is a folder under `wallpapers/<slug>/` holding either `image.jpg|png|webp` or a `style.css` whose root selector is `.wallpaper`.

```sh
pnpm icnl pack packs/gradients
pnpm icnl push dist/gradients.icnl --device tv
```

Then pick one in LumiOS → Settings → Background.
