# Edited card art

Drop your edited art in this folder and run:

```powershell
python scripts/prepare_edited_card_art.py
python scripts/make_card_sprites.py
```

File naming (the card id is the slug used everywhere else in the app):

```
<card>-front.png   red team  (character seen from the front)
<card>-back.png    blue team (character seen from behind)
```

Example:

```
docs/card-art/edited-card-art/phoenix-back.png
docs/card-art/edited-card-art/valkyrie-back.png
```

The script only trims the transparent margin and scales the art to the
canonical height (256px) - it never retouches anything. The animation strips
are rebuilt from your art by `scripts/make_card_sprites.py`.

The cards that still need an edited back view are listed in
`docs/card-art/README.md`.
