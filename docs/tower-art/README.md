# Tower art - sources and what is still needed

Everything in this folder was fetched from the Clash Royale wiki (see
`../scripts/fetch_tower_art.py` for the exact URLs). `contact-sheet.png` shows
all of it in one image.

## What the game uses right now

`frontend/public/towers/` (drop-in replacements, transparent PNG):

| File | Used for | Source |
| --- | --- | --- |
| `king-red-active.png` | red King Tower | `king-red-active.png` (wiki) |
| `king-red.png` | red King Tower (idle) | `king-red.png` (wiki) |
| `king-blue-active.png` | blue King Tower (player side, back view) | `king-blue-active.png` (wiki) |
| `king-blue.png` | blue King Tower (idle) | `king-blue.png` (wiki) |
| `princess-red.png` | red side tower | `princess-red.png` (wiki) |
| `princess-blue.png` | blue side tower | mirrored + recoloured `princess-red.png` |
| `princess-{cannoneer,duchess,chef}-red.png` | red side tower per crown-tower troop | wiki tower-troop render composited on the tower base |
| `princess-{cannoneer,duchess,chef}-blue.png` | blue side tower per crown-tower troop | mirrored + recoloured red variant |

## Still missing (no wiki asset exists)

The wiki has **no per-troop side-tower renders** - only the Archer Princess
tower (`princess-red.png`) and the crown-tower *skins* in this folder
(`skin-*.png`). The current per-troop variants are therefore composites and
look rough.

If you want proper art, please provide these exact files (transparent PNG,
the character standing on the stone tower, red = front view, blue = back view
of the player's own tower):

```
frontend/public/towers/princess-red.png              # Tower Princess (archer) on the red tower
frontend/public/towers/princess-blue.png              # same tower, blue side
frontend/public/towers/princess-cannoneer-red.png    # Cannoneer on the tower
frontend/public/towers/princess-cannoneer-blue.png
frontend/public/towers/princess-duchess-red.png       # Dagger Duchess on the tower
frontend/public/towers/princess-duchess-blue.png
frontend/public/towers/princess-chef-red.png          # Royal Chef on the tower
frontend/public/towers/princess-chef-blue.png
```

Useful references for posing/scale in this folder:
`princess-red.png` (real side tower), `crown-tower.png` (neutral tower base),
`troop-*.png` (the characters, front view), `king-blue-character.png` (blue king).
