# Mobile App Assets

Source images for generating iOS and Android app icons and splash screens.

Drop these files in here, then run `npm run mobile:assets` from the repo root
to generate every required size and copy them into the `ios/` and `android/`
projects.

## Required files

| File | Size | Purpose |
| --- | --- | --- |
| `icon.png` | **1024×1024** PNG, square, no transparency | iOS app icon and the foreground portion of the Android adaptive icon. The center 66% of this image will be visible inside the Android icon mask — don't put critical detail in the corners. |
| `icon-foreground.png` | **1024×1024** PNG with transparent background | Optional. If present, used as the Android adaptive icon foreground in place of `icon.png`. |
| `icon-background.png` | **1024×1024** PNG, solid color or pattern | Optional. Android adaptive icon background. Defaults to white if omitted. |
| `splash.png` | **2732×2732** PNG, centered logo on a solid background | Used as the launch splash screen on both platforms. |
| `splash-dark.png` | **2732×2732** PNG | Optional. Dark-mode variant of the splash. |

## Generating

```bash
npm run mobile:assets
```

This runs `@capacitor/assets generate --assetPath mobile-shell/assets` and
writes:

- `ios/App/App/Assets.xcassets/AppIcon.appiconset/*`
- `ios/App/App/Assets.xcassets/Splash.imageset/*`
- `android/app/src/main/res/mipmap-*/ic_launcher*`
- `android/app/src/main/res/drawable*/splash.png`

## Color reference

DragonHub brand colors used by the splash screen background:

- `--dragon-blue-900` (background of the public landing page)
- `--dragon-gold-400` (accent)

If you set a solid background for the splash, dragon-blue-900 keeps it
consistent with the marketing site.
