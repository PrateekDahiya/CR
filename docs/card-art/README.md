# Card art (per team, with movement)

Same treatment the towers got, extended to every card of the 108 card
catalogue:

| team | view | file |
| --- | --- | --- |
| red | character seen **from the front** | `frontend/public/cardart/<card>-front.png` |
| blue | character seen **from behind** | `frontend/public/cardart/<card>-back.png` |

The arena picks the view by team (red -> front, blue -> back) and flips the
sprite with the unit's facing, exactly like the king / princess towers.

## What is in here

```
docs/card-art/
  sources.json            manifest: which online source each card uses (+ the URL)
  sources/<card>-front.png     the online source (Clash Royale wiki render)
  sources/<card>-preview.webp  the online in-game animation clip of the card
  contact-sheet.png       contact sheet of every front render
  contact-sheet-preview.png   contact sheet of every preview clip
  edited-card-art/        YOUR edited art goes here (<card>-front.png / -back.png)
```

The checked-in sources are shrunk copies (400px renders, 160px clips) so the
repository stays small. The full resolution downloads stay in the local cache
of the fetch script and can always be fetched again from the URL stored in
`sources.json`.

## The pipeline

```powershell
# 1. download the online sources (wiki renders + the in-game preview clips)
python scripts/fetch_card_art.py

# 2. build the two team views into frontend/public/cardart/
python scripts/make_card_art.py

# 3. cut the 2D animation strips (idle / walk / attack / death) per view
python scripts/make_card_sprites.py

# 4. after you edit the art in docs/card-art/edited-card-art/
python scripts/prepare_edited_card_art.py
python scripts/make_card_sprites.py
```

### Sources

Every card render was fetched from the **Clash Royale wiki**
(`<Card> card render.png`, `<Card> Render.png`, `<Card>Card.png` - the wiki is
not consistent). 108/108 cards have a source:

* 103 cards use the high resolution 3D character render (the same art the
  wiki shows on the card page),
* 5 cards only exist as a card tile / spell badge and fall back to the card
  art the app already ships (`fireball`, `giant-snowball`, `poison`, `rage`,
  `royal-chef`).

For 59 of the 108 cards the wiki also ships a **Preview.gif** - a short clip
of the real card in a real battle. Those clips are kept in `sources/` as the
reference for the movement, and they are the place to look when you want to
repaint a walk cycle by hand.

### The two views

The wiki publishes **no back view for troops** (only the towers have one, see
`docs/tower-art/`). The blue view is therefore derived exactly like the
princess tower was:

1. the front render is mirrored horizontally (the character is seen from the
   other side), and
2. the red team colours are rotated to the blue team hue (hue 212), so gold,
   skin, wood and stone keep their colour.

### The animation strips

`scripts/make_card_sprites.py` cuts an **8 frame** strip (96x96 per frame)
per card **and per view**:

```
0-1  idle     breathing (small bob / stretch)
2-5  walk     the lower body sways over the legs while the unit bobs and leans
6    attack   the unit lunges forward and grows
7    death    the unit topples over and fades out
```

The walk is a smooth per-row warp of the artwork (the legs swing, the torso
stays), so the art is never torn apart. The frames bake in a soft feathered
edge, so the units blend into the arena instead of sitting in a hard box.

Strips live in `frontend/public/sprites/<card>-<view>.png` (gitignored, like
the rest of the generated art). The canvas falls back to
`/sprites/<card>.png` (old neutral strip), then to
`/cardart/<card>-<view>.png` (static team art), then to `/cards/<card>.png`
and finally to the emoji glyph - a missing asset never breaks a match.

---

## Files that still need hand editing

### 1. Cards where the blue (back) view needs a real back

The blue view of these cards is mostly red, so the automatic hue shift
recolours the character itself. They need a hand painted blue/back version
(drop `docs/card-art/edited-card-art/<card>-back.png`):

| card | red pixels in the source |
| --- | --- |
| `arrows` | 68.7% |
| `earthquake` | 82.1% |
| `fire-spirit` | 58.5% |
| `fireball` | 52.3% |
| `golden-knight` | 46.7% |
| `hog-rider` | 48.5% |
| `phoenix` | 73.9% |
| `poison` | 78.9% |
| `royal-hogs` | 46.9% |
| `tesla` | 52.8% |
| `the-log` | 45.5% |
| `valkyrie` | 53.1% |
| `void` | 74.2% |

### 2. Cards whose source is a card tile, not a character render

These five only exist on the wiki as a full card tile / spell badge, so the
arena shows the cropped tile instead of a 3D character. A hand edited
character render would be much better:

| card | source used |
| --- | --- |
| `fireball` | legacy card tile (`frontend/public/cards/fireball.png`) |
| `giant-snowball` | legacy card tile |
| `poison` | legacy card tile |
| `rage` | legacy card tile |
| `royal-chef` | wiki card tile (`RoyalChefCard.png`) |

### 3. The 19 spells

`arrows`, `barbarian-barrel`, `clone`, `earthquake`, `fireball`, `freeze`,
`giant-snowball`, `goblin-barrel`, `goblin-curse`, `graveyard`, `lightning`,
`poison`, `rage`, `rocket`, `royal-delivery`, `the-log`, `tornado`, `void`,
`zap`

Spells have no character, so "front" and "back" only mirror the spell art.
If you want a proper red/blue spell render, drop
`docs/card-art/edited-card-art/<card>-front.png` and `<card>-back.png`.

### 4. Optional: a hand painted walk cycle

The strips are generated from a single render (the wiki has no per-frame
troop art). If you want a real hand drawn walk cycle for a card, drop an
**8 frame** strip (8 x 96px wide, frames left to right: idle, idle, walk,
walk, walk, walk, attack, death) into
`frontend/public/sprites/<card>-<view>.png` and it is used as is - the
renderer never regenerates that file.

## How to verify

* `/animations` shows all 108 cards: red front view on the top row, blue
  back view on the bottom row, with idle / walk / attack / death.
* `frontend/tests/card-art.spec.ts` guards the two views, the team strip
  loading and the fallback chain.
* Screenshots: `docs/screenshots/card-art-arena.png`,
  `card-art-red-side.png`, `card-art-blue-side.png`,
  `card-art-animations.png`.
