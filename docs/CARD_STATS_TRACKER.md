# Clash Royale Card Stats Tracker

Generated from `infra/mysql/card_stats_source.json` by
`scripts/generate_card_tracker.py`. Do not hand-edit the tables; change the
importer/overrides and regenerate.

## Progress

- Cards captured: **108 / 108**
- Descriptions captured: **108 / 108**
- Canonical stat tables generated: **yes** (108/108)
- Exact level 1-16 rows generated: **yes** (level-11 anchored, 1.1x rule)
- Mechanics reconciled per card: **yes** (targeting/attack/radius/durations)
- Card Info Stats/Description tabs: **yes**
- Arena geometry verification: **yes** (centre x=9, lanes 3.5/14.5)

Status legend: `captured` = wiki data present; `verified` = stat values and
mechanics checked against the description and tests; `pending` = not done.

## Phase 1 - Win conditions and tanks (15 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| ice-golem | 2 | troop | rare | 1315 | 92 | 2.5 | 0.75 | 1 | Slow | buildings | death 92 | attack=single target=buildings move=ground onDeath: areaDamage, status | verified |
| elixir-golem | 3 | troop | rare | 1569 | 253 | 1.1 | 0.8 | 1 | Slow | buildings | - | attack=single target=buildings move=ground onDeath: split, elixir | verified |
| miner | 3 | troop | legendary | 1210 | 194 | 1.3 | 1.2 | 1 | Fast | ground | - | attack=single target=ground move=burrow onDeploy: teleport | verified |
| skeleton-barrel | 3 | troop | common | 532 | 0 | 0 | 0.35 | 1 | Fast | buildings | death 145 | attack=none target=buildings move=flying onDeath: areaDamage, spawn | verified |
| battle-ram | 4 | troop | rare | 967 | 286 | 1.5 | 0.5 | 1 | Medium | buildings | charge 573 | attack=single target=buildings move=ground onAttack: dash; onDeath: spawn | verified |
| hog-rider | 4 | troop | rare | 1697 | 317 | 1.6 | 0.8 | 1 | Very Fast | buildings | - | attack=single target=buildings move=ground | verified |
| balloon | 5 | troop | epic | 1679 | 640 | 2 | 0.1 | 1 | Medium | buildings | death 240 | attack=single target=buildings move=flying onDeath: areaDamage | verified |
| giant | 5 | troop | rare | 3968 | 253 | 1.5 | 1.2 | 1 | Slow | buildings | - | attack=single target=buildings move=ground | verified |
| ram-rider | 5 | troop | legendary | 1766 | 250 | 1.8 | 0.8 | 1 | Medium | buildings | charge 501 | attack=single target=buildings move=ground onAttack: dash, status | verified |
| royal-hogs | 5 | troop | rare | 837 | 74 | 1.2 | 0.7 | 4 | Very Fast | buildings | - | attack=single target=buildings move=ground | verified |
| giant-skeleton | 6 | troop | epic | 3361 | 276 | 1.3 | 0.8 | 1 | Medium | ground | death 688 | attack=single target=ground move=ground onDeath: areaDamage | verified |
| goblin-giant | 6 | troop | epic | 3022 | 176 | 1.5 | 1.2 | 1 | Medium | buildings | - | attack=single target=buildings move=ground onDeploy: spawn | verified |
| royal-giant | 6 | troop | common | 3164 | 307 | 1.8 | 5 | 1 | Slow | buildings | - | attack=single target=buildings move=ground | verified |
| lava-hound | 7 | troop | legendary | 3581 | 53 | 1.3 | 3.5 | 1 | Slow | buildings | - | attack=single target=buildings move=flying onDeath: split | verified |
| golem | 8 | troop | epic | 5120 | 312 | 2.5 | 0.75 | 1 | Slow | buildings | death 225 | attack=single target=buildings move=ground onDeath: areaDamage, split | verified |

## Phase 2 - Ground melee and mini-tanks (12 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| bandit | 3 | troop | legendary | 906 | 194 | 1 | 0.75 | 1 | Fast | ground | dash 389 | attack=single target=ground move=ground onAttack: dash | verified |
| fisherman | 3 | troop | legendary | 870 | 194 | 1.3 | 1.2 | 1 | Medium | ground | - | attack=single target=ground move=ground onAttack: teleport | verified |
| knight | 3 | troop | common | 1766 | 202 | 1.2 | 1.2 | 1 | Medium | ground | - | attack=single target=ground move=ground | verified |
| royal-ghost | 3 | troop | legendary | 1210 | 261 | 1.8 | 1.2 | 1 | Fast | ground | - | attack=single target=ground move=ground onDeploy: status; onAttack: status | verified |
| dark-prince | 4 | troop | epic | 1200 | 266 | 1.4 | 1.2 | 1 | Medium | ground | charge 532, shield 256, radius 1.1 | attack=splash target=ground move=ground onDeploy: status; onAttack: dash | verified |
| goblin-demolisher | 4 | troop | rare | 1300 | 186 | 1.2 | 5 | 1 | Medium | ground | death 404, radius 1.5 | attack=splash target=ground move=ground onDeath: areaDamage | verified |
| lumberjack | 4 | troop | legendary | 1282 | 256 | 0.8 | 0.7 | 1 | Very Fast | ground | - | attack=single target=ground move=ground onDeath: spawn | verified |
| mini-pekka | 4 | troop | rare | 1390 | 755 | 1.6 | 0.8 | 1 | Fast | ground | - | attack=single target=ground move=ground | verified |
| valkyrie | 4 | troop | rare | 1907 | 266 | 1.5 | 1.2 | 1 | Medium | ground | radius 2 | attack=splash target=ground move=ground | verified |
| prince | 5 | troop | epic | 1920 | 391 | 1.4 | 1.6 | 1 | Medium | ground | charge 783 | attack=single target=ground move=ground onAttack: dash | verified |
| mega-knight | 7 | troop | legendary | 3993 | 268 | 1.7 | 1.2 | 1 | Medium | ground | spawn 430, radius 1.3 | attack=splash target=ground move=ground onDeploy: areaDamage; onAttack: dash | verified |
| pekka | 7 | troop | epic | 3760 | 842 | 1.8 | 1.2 | 1 | Slow | ground | - | attack=single target=ground move=ground | verified |

## Phase 3 - Ranged and air troops (22 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| bomber | 2 | troop | common | 304 | 212 | 1.8 | 4.5 | 1 | Medium | ground | radius 1.5 | attack=splash target=ground move=ground | verified |
| archers | 3 | troop | common | 304 | 112 | 0.9 | 5 | 2 | Medium | air+ground | - | attack=single target=air+ground move=ground | verified |
| dart-goblin | 3 | troop | rare | 261 | 156 | 0.8 | 6.5 | 1 | Very Fast | air+ground | - | attack=single target=air+ground move=ground | verified |
| firecracker | 3 | troop | common | 304 | 64 | 3 | 6 | 1 | Fast | air+ground | - | attack=splash target=air+ground move=ground onAttack: areaDamage, knockback | verified |
| ice-wizard | 3 | troop | legendary | 688 | 89 | 1.7 | 5.5 | 1 | Medium | air+ground | spawn 84, radius 1.5 | attack=splash target=air+ground move=ground onDeploy: status, areaDamage; onAttack: status | verified |
| princess | 3 | troop | legendary | 261 | 168 | 3 | 9 | 1 | Medium | air+ground | radius 2 | attack=splash target=air+ground move=ground | verified |
| baby-dragon | 4 | troop | epic | 1152 | 168 | 1.5 | 3.5 | 1 | Fast | air+ground | radius 1.5 | attack=splash target=air+ground move=flying | verified |
| electro-wizard | 4 | troop | legendary | 714 | 115 | 1.8 | 5 | 1 | Fast | air+ground | - | attack=chain target=air+ground move=ground onDeploy: areaDamage, status; onAttack: chain, status | verified |
| flying-machine | 4 | troop | rare | 614 | 171 | 1.1 | 6 | 1 | Fast | air+ground | - | attack=single target=air+ground move=flying | verified |
| inferno-dragon | 4 | troop | legendary | 1295 | 35 | 0.4 | 3.5 | 1 | Medium | air+ground | - | attack=beam target=air+ground move=flying onAttack: ramp | verified |
| magic-archer | 4 | troop | legendary | 529 | 133 | 1.1 | 7 | 1 | Medium | air+ground | - | attack=pierce target=air+ground move=ground onAttack: pierce | verified |
| mother-witch | 4 | troop | legendary | 529 | 133 | 1 | 5.5 | 1 | Medium | air+ground | - | attack=single target=air+ground move=ground onAttack: status | verified |
| musketeer | 4 | troop | rare | 721 | 217 | 1 | 6 | 1 | Medium | air+ground | - | attack=single target=air+ground move=ground | verified |
| night-witch | 4 | troop | legendary | 906 | 314 | 1.3 | 1.6 | 1 | Medium | ground | spawn /5s | attack=single target=ground move=ground onDeath: spawn; periodic: spawn | verified |
| phoenix | 4 | troop | legendary | 1052 | 217 | 1 | 1.6 | 1 | Medium | air+ground | death 163, spawn /3.8s | attack=single target=air+ground move=flying onDeath: areaDamage, spawn | verified |
| zappies | 4 | troop | rare | 529 | 117 | 2.2 | 4.5 | 3 | Medium | air+ground | - | attack=chain target=air+ground move=ground onAttack: status | verified |
| bowler | 5 | troop | epic | 2081 | 289 | 2.5 | 4 | 1 | Slow | ground | - | attack=pierce target=ground move=ground onAttack: knockback | verified |
| electro-dragon | 5 | troop | epic | 1049 | 192 | 2.3 | 3.5 | 1 | Medium | air+ground | - | attack=chain target=air+ground move=flying onAttack: chain, status | verified |
| executioner | 5 | troop | epic | 1280 | 168 | 0.9 | 4.5 | 1 | Medium | air+ground | - | attack=pierce target=air+ground move=ground onAttack: pierce | verified |
| witch | 5 | troop | epic | 839 | 135 | 1.1 | 5.5 | 1 | Medium | air+ground | radius 1.5, spawn /7s | attack=splash target=air+ground move=ground periodic: spawn | verified |
| wizard | 5 | troop | rare | 832 | 281 | 1.4 | 5.5 | 1 | Medium | air+ground | radius 1.5 | attack=splash target=air+ground move=ground | verified |
| sparky | 6 | troop | legendary | 1451 | 1331 | 4 | 5 | 1 | Slow | ground | radius 1.8 | attack=splash target=ground move=ground onAttack: status | verified |

## Phase 4 - Swarms and support spawns (15 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| fire-spirit | 1 | troop | common | 215 | 207 | 0 | 2.5 | 1 | Very Fast | air+ground | radius 2.3 | attack=suicide target=air+ground move=ground onAttack: areaDamage | verified |
| ice-spirit | 1 | troop | common | 215 | 110 | 0 | 2.5 | 1 | Very Fast | air+ground | radius 1.5, duration 1.1s | attack=suicide target=air+ground move=ground onAttack: areaDamage, status | verified |
| skeletons | 1 | troop | common | 81 | 81 | 1.1 | 0.5 | 3 | Fast | ground | - | attack=single target=ground move=ground | verified |
| bats | 2 | troop | common | 81 | 81 | 1.3 | 1.2 | 5 | Very Fast | air+ground | - | attack=single target=air+ground move=flying | verified |
| goblins | 2 | troop | common | 202 | 125 | 1.1 | 0.5 | 4 | Very Fast | ground | - | attack=single target=ground move=ground | verified |
| spear-goblins | 2 | troop | common | 133 | 81 | 1.6 | 5 | 3 | Very Fast | air+ground | - | attack=single target=air+ground move=ground | verified |
| goblin-gang | 3 | troop | common | 202 | 120 | 1.1 | 0.5 | 6 | Very Fast | ground | - | attack=single target=ground move=ground onDeploy: spawn, spawn | verified |
| guards | 3 | troop | epic | 81 | 117 | 1 | 1.6 | 3 | Fast | ground | shield 256 | attack=single target=ground move=ground onDeploy: status | verified |
| minions | 3 | troop | common | 230 | 107 | 1.2 | 2.5 | 3 | Fast | air+ground | - | attack=single target=air+ground move=flying | verified |
| skeleton-army | 3 | troop | epic | 81 | 81 | 1.1 | 0.5 | 15 | Fast | ground | - | attack=single target=ground move=ground | verified |
| barbarians | 5 | troop | common | 716 | 192 | 1.4 | 0.7 | 5 | Medium | ground | - | attack=single target=ground move=ground | verified |
| minion-horde | 5 | troop | common | 230 | 107 | 1.1 | 2.5 | 6 | Fast | air+ground | - | attack=single target=air+ground move=flying | verified |
| rascals | 5 | troop | common | 1868 | 217 | 1.5 | 0.8 | 3 | Medium | ground | - | attack=single target=ground move=ground onDeploy: spawn, spawn | verified |
| elite-barbarians | 6 | troop | common | 1341 | 384 | 1.4 | 1.2 | 2 | Fast | ground | - | attack=single target=ground move=ground | verified |
| royal-recruits | 7 | troop | common | 547 | 133 | 1.3 | 1.6 | 6 | Medium | ground | shield 240 | attack=single target=ground move=ground onDeploy: status | verified |

## Phase 5 - Champions and abilities (8 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| little-prince | 3 | troop | champion | 698 | 104 | 1.2 | 5.5 | 1 | Medium | air+ground | - | attack=single target=air+ground move=ground ability: spawn | verified |
| golden-knight | 4 | troop | champion | 1799 | 161 | 0.9 | 1.2 | 1 | Medium | ground | dash 335 | attack=single target=ground move=ground ability: dash | verified |
| mighty-miner | 4 | troop | champion | 2250 | 40 | 0.4 | 1.6 | 1 | Medium | ground | escape 332 | attack=beam target=ground move=ground onAttack: ramp; ability: teleport, areaDamage | verified |
| skeleton-king | 4 | troop | champion | 2298 | 204 | 1.6 | 1.2 | 1 | Medium | ground | radius 1.3 | attack=single target=ground move=ground ability: spawn | verified |
| archer-queen | 5 | troop | champion | 1000 | 225 | 1.2 | 5 | 1 | Medium | air+ground | - | attack=single target=air+ground move=ground ability: status, status | verified |
| goblinstein | 5 | troop | champion | 721 | 92 | 1.8 | 5.5 | 1 | Medium | air+ground | - | attack=single target=air+ground move=ground onDeploy: spawn; ability: chain | verified |
| monk | 5 | troop | champion | 2214 | 140 | 0.8 | 1.2 | 1 | Medium | ground | - | attack=single target=ground move=ground ability: status | verified |
| boss-bandit | 6 | troop | champion | 2624 | 245 | 1.1 | 0.8 | 1 | Fast | ground | dash 491 | attack=single target=ground move=ground onAttack: dash | verified |

## Phase 6 - Spells (19 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| barbarian-barrel | 2 | spell | rare | 0 | 215 | 0 | 0 | 0 | Static | ground | radius 2.6, roll 4.5 | attack=none target=ground onDeploy: damage; onDeath: spawn | verified |
| giant-snowball | 2 | spell | common | 0 | 179 | 0 | 0 | 0 | Static | all | radius 2.5 | attack=none target=all onDeploy: areaDamage, knockback, status | verified |
| goblin-curse | 2 | spell | epic | 0 | 35 | 0 | 0 | 0 | Static | all | radius 3, duration 6s | attack=none target=all onDeploy: status, areaDamage | verified |
| rage | 2 | spell | epic | 0 | 0 | 0 | 0 | 0 | Static | all | radius 3, duration 4.5s | attack=none target=friendly onDeploy: status | verified |
| the-log | 2 | spell | legendary | 0 | 268 | 0 | 0 | 0 | Static | ground | radius 3.9, roll 10.1 | attack=none target=ground onDeploy: damage, knockback | verified |
| zap | 2 | spell | common | 0 | 192 | 0 | 0 | 0 | Static | all | radius 2.5 | attack=none target=all onDeploy: areaDamage, status | verified |
| arrows | 3 | spell | common | 0 | 122 | 0 | 0 | 0 | Static | all | radius 3.5 | attack=none target=all onAttack: areaDamage | verified |
| clone | 3 | spell | epic | 0 | 0 | 0 | 0 | 0 | Static | all | radius 3 | attack=none target=friendly onDeploy: clone | verified |
| earthquake | 3 | spell | rare | 0 | 84 | 0 | 0 | 0 | Static | ground | radius 3.5, duration 3s | attack=none target=ground onDeploy: areaDamage | verified |
| goblin-barrel | 3 | spell | epic | 0 | 0 | 0 | 0 | 0 | Static | all | radius 1.5 | attack=none target=all onDeploy: spawn | verified |
| royal-delivery | 3 | spell | common | 0 | 437 | 0 | 0 | 0 | Static | all | shield 240, radius 3 | attack=none target=enemy onDeploy: areaDamage, spawn | verified |
| tornado | 3 | spell | epic | 0 | 84 | 0 | 0 | 0 | Static | all | radius 5.5, duration 1.05s | attack=none target=enemy onDeploy: areaDamage, knockback | verified |
| fireball | 4 | spell | rare | 0 | 688 | 0 | 0 | 0 | Static | all | radius 2.5 | attack=none target=all onDeploy: areaDamage, knockback | verified |
| freeze | 4 | spell | epic | 0 | 115 | 0 | 0 | 0 | Static | all | radius 3, duration 4s | attack=none target=all onDeploy: areaDamage, status | verified |
| poison | 4 | spell | epic | 0 | 92 | 0 | 0 | 0 | Static | all | radius 3.5 | attack=none target=all onDeploy: areaDamage | verified |
| graveyard | 5 | spell | legendary | 0 | 0 | 0 | 0 | 0 | Static | all | radius 4, duration 9s, spawn /0.5s | attack=none target=all onDeploy: spawn | verified |
| void | 5 | spell | epic | 0 | 696 | 0 | 0 | 0 | Static | all | radius 2.5, duration 4s | attack=none target=all onDeploy: areaDamage | verified |
| lightning | 6 | spell | epic | 0 | 1057 | 0 | 0 | 0 | Static | all | radius 3.5 | attack=none target=all onDeploy: chain, status | verified |
| rocket | 6 | spell | rare | 0 | 1484 | 0 | 0 | 0 | Static | all | radius 2 | attack=none target=all onDeploy: areaDamage | verified |

## Phase 7 - Buildings and tower troops (16 cards)

| Card | Cost | Type | Rarity | HP | Damage | Hit spd | Range | Count | Speed | Targets | Special | Mechanics | Status |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| cannoneer | 0 | tower | epic | 2616 | 320 | 2.2 | 7.5 | 1 | Medium | air+ground | - | attack=single target=air+ground tower troop | verified |
| dagger-duchess | 0 | tower | legendary | 2768 | 107 | 0.5 | 7.5 | 1 | Medium | air+ground | - | attack=single target=air+ground tower troop onAttack: damage | verified |
| royal-chef | 0 | tower | legendary | 2703 | 109 | 1 | 7.5 | 1 | Medium | air+ground | - | attack=single target=air+ground tower troop periodic: levelUp | verified |
| tower-princess | 0 | tower | common | 3052 | 109 | 0.8 | 7.5 | 1 | Medium | air+ground | - | attack=single target=air+ground tower troop | verified |
| cannon | 3 | building | common | 824 | 212 | 1 | 5.5 | 1 | Static | ground | life 30s | attack=single target=ground move=ground | verified |
| tombstone | 3 | building | rare | 529 | 0 | 0 | 0 | 1 | Static | none | life 30s, spawn /4s | attack=none target=none move=ground onDeath: spawn; periodic: spawn | verified |
| bomb-tower | 4 | building | rare | 1356 | 222 | 1.8 | 6 | 1 | Static | ground | death 222, radius 1.5, life 30s | attack=splash target=ground move=ground onDeath: areaDamage | verified |
| goblin-cage | 4 | building | rare | 780 | 0 | 0 | 0 | 1 | Static | none | life 20s | attack=none target=none move=ground onDeath: spawn | verified |
| goblin-drill | 4 | building | epic | 1313 | 0 | 0 | 0 | 1 | Static | none | spawn 84, life 10s, spawn /3s | attack=none target=none move=ground onDeploy: spawn, areaDamage; onDeath: spawn; periodic: spawn | verified |
| goblin-hut | 4 | building | rare | 1228 | 0 | 0 | 0 | 1 | Static | none | life 30s, spawn /2.2s | attack=none target=none move=ground periodic: spawn | verified |
| mortar | 4 | building | common | 1369 | 266 | 5 | 11.5 | 1 | Static | ground | radius 2, life 30s | attack=splash target=ground move=siege onAttack: damage | verified |
| tesla | 4 | building | common | 1152 | 220 | 1.1 | 5.5 | 1 | Static | air+ground | life 25s | attack=single target=air+ground move=ground onDeploy: status; onAttack: status | verified |
| inferno-tower | 5 | building | rare | 1748 | 43 | 0.4 | 6 | 1 | Static | air+ground | life 30s | attack=beam target=air+ground move=ground onAttack: ramp | verified |
| barbarian-hut | 6 | building | rare | 1164 | 0 | 0 | 0 | 1 | Static | none | life 30s, spawn /15s | attack=none target=none move=ground periodic: spawn | verified |
| elixir-collector | 6 | building | rare | 1070 | 0 | 0 | 0 | 1 | Static | none | life 93s | attack=none target=none move=ground periodic: elixir | verified |
| x-bow | 6 | building | epic | 1600 | 61 | 0.4 | 11.5 | 1 | Static | ground | life 30s | attack=beam target=ground move=siege onAttack: status | verified |

## Card descriptions

These are the short card-info texts captured for the new Description tab.

- **ice-golem** (Ice Golem): He's tough, targets buildings and explodes when destroyed, slowing nearby enemies. Made entirely out of ice... or is he?! Yes.
  Source: https://clashroyale.fandom.com/wiki/Ice_Golem
- **elixir-golem** (Elixir Golem): Splits into two Elixir Golemites when destroyed, which split into two sentient Blobs when defeated. Each part of the Elixir Golem gives your opponent some Elixir when destroyed!
  Source: https://clashroyale.fandom.com/wiki/Elixir_Golem
- **miner** (Miner): The Miner can burrow his way underground and appear anywhere in the Arena. It's not magic, it's a shovel. A shovel that deals reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Miner
- **skeleton-barrel** (Skeleton Barrel): It's a Skeleton party in the sky, until all the balloons pop... then it's a Skeleton party on the ground!
  Source: https://clashroyale.fandom.com/wiki/Skeleton_Barrel
- **battle-ram** (Battle Ram): Two Barbarians holding a big log charge at the nearest building, dealing significant damage if they connect; then they go to town with their swords!
  Source: https://clashroyale.fandom.com/wiki/Battle_Ram
- **hog-rider** (Hog Rider): Fast melee troop that targets buildings and can jump over the river. He followed the echoing call of "Hog Riderrrrr" all the way through the Arena doors.
  Source: https://clashroyale.fandom.com/wiki/Hog_Rider
- **balloon** (Balloon): As pretty as they are, you won't want a parade of THESE balloons showing up on the horizon. Drops powerful bombs and when shot down, crashes dealing area damage.
  Source: https://clashroyale.fandom.com/wiki/Balloon
- **giant** (Giant): Slow but durable, only attacks buildings. A real one-man wrecking crew!
  Source: https://clashroyale.fandom.com/wiki/Giant
- **ram-rider** (Ram Rider): Together they charge through the Arena; snaring enemies, knocking down towers... and chewing grass!?
  Source: https://clashroyale.fandom.com/wiki/Ram_Rider
- **royal-hogs** (Royal Hogs): The King’s personal pets are loose! They love to chomp on apples and towers alike - who let the hogs out?!
  Source: https://clashroyale.fandom.com/wiki/Royal_Hogs
- **giant-skeleton** (Giant Skeleton): The bigger the skeleton, the bigger the bomb. Carries a bomb that blows up when the Giant Skeleton dies.
  Source: https://clashroyale.fandom.com/wiki/Giant_Skeleton
- **goblin-giant** (Goblin Giant): This jolly green Goblin Giant stomps towards enemy buildings. He carries two Spear Goblins everywhere he goes. It's a weird but functional arrangement.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Giant
- **royal-giant** (Royal Giant): Destroying enemy buildings with his massive cannon is his job; making a raggedy blond beard look good is his passion.
  Source: https://clashroyale.fandom.com/wiki/Royal_Giant
- **lava-hound** (Lava Hound): The Lava Hound is a majestic flying beast that attacks buildings. The Lava Pups are less majestic angry babies that attack anything.
  Source: https://clashroyale.fandom.com/wiki/Lava_Hound
- **golem** (Golem): Slow but durable, only attacks buildings. When destroyed, explosively splits into two Golemites and deals area damage!
  Source: https://clashroyale.fandom.com/wiki/Golem
- **bandit** (Bandit): The Bandit dashes to her target and delivers an extra big hit! While dashing, she can't be touched. The mask keeps her identity safe, and gives her bonus cool points!
  Source: https://clashroyale.fandom.com/wiki/Bandit
- **fisherman** (Fisherman): His Ranged Attack can pull enemies towards him, and pull himself to enemy buildings. He's also mastered the ancient art of 'Fish Slapping'.
  Source: https://clashroyale.fandom.com/wiki/Fisherman
- **knight** (Knight): A tough melee fighter. The Barbarian's handsome, cultured cousin. Rumor has it that he was knighted based on the sheer awesomeness of his mustache alone.
  Source: https://clashroyale.fandom.com/wiki/Knight
- **royal-ghost** (Royal Ghost): He drifts invisibly through the Arena until he's startled by an enemy... then he attacks! Then he's invisible again! Zzzz.
  Source: https://clashroyale.fandom.com/wiki/Royal_Ghost
- **dark-prince** (Dark Prince): The Dark Prince deals area damage and lets his spiked club do the talking for him - because when he does talk, it sounds like he has a bucket on his head.
  Source: https://clashroyale.fandom.com/wiki/Dark_Prince
- **goblin-demolisher** (Goblin Demolisher): Boom goes dynamite! Goblin Demolisher deals area damage and explodes on death. At low health, he charges towards the nearest building.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Demolisher
- **lumberjack** (Lumberjack): He chops trees by day and hunts The Log by night. His bottle of Rage spills everywhere when he's defeated.
  Source: https://clashroyale.fandom.com/wiki/Lumberjack
- **mini-pekka** (Mini P.E.K.K.A.): The Arena is a certified butterfly-free zone. No distractions for P.E.K.K.A, only destruction.
  Source: https://clashroyale.fandom.com/wiki/Mini_P.E.K.K.A.
- **valkyrie** (Valkyrie): Tough melee fighter, deals area damage around her. Swarm or horde, no problem! She can take them all out with a few spins.
  Source: https://clashroyale.fandom.com/wiki/Valkyrie
- **prince** (Prince): Don't let the little pony fool you. Once the Prince gets a running start, you WILL be trampled. Deals double damage once he gets charging.
  Source: https://clashroyale.fandom.com/wiki/Prince
- **mega-knight** (Mega Knight): He lands with the force of 1,000 mustaches, then jumps from one foe to the next dealing huge area damage. Stand aside!
  Source: https://clashroyale.fandom.com/wiki/Mega_Knight
- **pekka** (P.E.K.K.A.): A heavily armored, slow melee fighter. Swings from the hip, but packs a huge punch.
  Source: https://clashroyale.fandom.com/wiki/P.E.K.K.A.
- **bomber** (Bomber): Small, lightly protected skeleton who throws bombs. Deals area damage that can wipe out a swarm of enemies.
  Source: https://clashroyale.fandom.com/wiki/Bomber
- **archers** (Archers): A pair of lightly armored ranged attackers. They'll help you take down ground and air units, but you're on your own with hair coloring advice.
  Source: https://clashroyale.fandom.com/wiki/Archers
- **dart-goblin** (Dart Goblin): Runs fast, shoots far and chews gum. How does he blow darts with a mouth full of Double Trouble gum? Years of didgeridoo lessons.
  Source: https://clashroyale.fandom.com/wiki/Dart_Goblin
- **firecracker** (Firecracker): Shoots a firework that explodes on impact, damaging the target and showering anything behind it with sparks. This is what happens when Archers get bored!
  Source: https://clashroyale.fandom.com/wiki/Firecracker
- **ice-wizard** (Ice Wizard): This chill caster throws ice shards that slow down enemies' movement and attack speed. Despite being freezing cold, he has a handlebar mustache that's too hot for TV.
  Source: https://clashroyale.fandom.com/wiki/Ice_Wizard
- **princess** (Princess): This stunning Princess shoots flaming arrows from long range. If you're feeling warm feelings towards her, it's probably because you're on fire.
  Source: https://clashroyale.fandom.com/wiki/Princess
- **baby-dragon** (Baby Dragon): Burps fireballs from the sky that deal area damage. Baby dragons hatch cute, hungry and ready for a barbeque.
  Source: https://clashroyale.fandom.com/wiki/Baby_Dragon
- **electro-wizard** (Electro Wizard): He lands with a "POW!", stuns nearby enemies and shoots lightning with both hands! What a show off.
  Source: https://clashroyale.fandom.com/wiki/Electro_Wizard
- **flying-machine** (Flying Machine): The Master Builder has sent his first contraption to the Arena! It's a fast and fun flying machine, but fragile!
  Source: https://clashroyale.fandom.com/wiki/Flying_Machine
- **inferno-dragon** (Inferno Dragon): Shoots a focused beam of fire that increases in damage over time. Wears a helmet because flying can be dangerous.
  Source: https://clashroyale.fandom.com/wiki/Inferno_Dragon
- **magic-archer** (Magic Archer): Not quite a Wizard, nor an Archer - he shoots a magic arrow that passes through and damages all enemies in its path. It's not a trick, it's magic!
  Source: https://clashroyale.fandom.com/wiki/Magic_Archer
- **mother-witch** (Mother Witch): Places a curse on enemy troops with each attack. When a cursed troop is destroyed, it turns into a building-targeting Hog that fights alongside the Mother Witch. She also bakes great cookies.
  Source: https://clashroyale.fandom.com/wiki/Mother_Witch
- **musketeer** (Musketeer): Don't be fooled by her delicately coiffed hair, the Musketeer is a mean shot with her trusty boomstick.
  Source: https://clashroyale.fandom.com/wiki/Musketeer
- **night-witch** (Night Witch): Summons Bats to do her bidding! If you get too close, she's not afraid of pitching in with her mean-looking battle staff.
  Source: https://clashroyale.fandom.com/wiki/Night_Witch
- **phoenix** (Phoenix): This mystical creature will be reborn as an egg when destroyed. If it hatches, it returns to the fight! What an egg-cellent ability.
  Source: https://clashroyale.fandom.com/wiki/Phoenix
- **zappies** (Zappies): Spawns a pack of miniature Zap machines. Who controls them...? Only the Master Builder knows.
  Source: https://clashroyale.fandom.com/wiki/Zappies
- **bowler** (Bowler): This big blue dude digs the simple things in life - Dark Elixir drinks and throwing rocks. His massive boulders roll through their target, hitting everything behind for a strike!
  Source: https://clashroyale.fandom.com/wiki/Bowler
- **electro-dragon** (Electro Dragon): Spits out bolts of electricity hitting up to three targets. Suffers from middle child syndrome to boot.
  Source: https://clashroyale.fandom.com/wiki/Electro_Dragon
- **executioner** (Executioner): He throws his axe like a boomerang, striking all enemies on the way out AND back. It's a miracle he doesn't lose an arm.
  Source: https://clashroyale.fandom.com/wiki/Executioner
- **witch** (Witch): Summons Skeletons, shoots destructo beams, has glowing pink eyes that unfortunately don't shoot lasers.
  Source: https://clashroyale.fandom.com/wiki/Witch
- **wizard** (Wizard): The most awesome man to ever set foot in the Arena, the Wizard will blow you away with his handsomeness... and/or fireballs.
  Source: https://clashroyale.fandom.com/wiki/Wizard
- **sparky** (Sparky): Sparky slowly charges up, then unloads MASSIVE area damage. Overkill isn't in her vocabulary.
  Source: https://clashroyale.fandom.com/wiki/Sparky
- **fire-spirit** (Fire Spirit): The Fire Spirit is on a kamikaze mission to give you a warm hug. It'd be adorable if it wasn't on fire.
  Source: https://clashroyale.fandom.com/wiki/Fire_Spirit
- **ice-spirit** (Ice Spirit): Spawns one lively little Ice Spirit to freeze a group of enemies. Stay frosty.
  Source: https://clashroyale.fandom.com/wiki/Ice_Spirit
- **skeletons** (Skeletons): Three fast, very weak melee fighters. Surround your enemies with this pile of bones!
  Source: https://clashroyale.fandom.com/wiki/Skeletons
- **bats** (Bats): Spawns a handful of tiny flying creatures. Think of them as sweet, purple... balls of DESTRUCTION!
  Source: https://clashroyale.fandom.com/wiki/Bats
- **goblins** (Goblins): Four fast, unarmored melee attackers. Small, fast, green and mean!
  Source: https://clashroyale.fandom.com/wiki/Goblins
- **spear-goblins** (Spear Goblins): Three unarmored ranged attackers. Who the heck taught these guys to throw spears!? Who thought that was a good idea?!
  Source: https://clashroyale.fandom.com/wiki/Spear_Goblins
- **goblin-gang** (Goblin Gang): Spawns Six Goblins - three with knives, three with spears - at a discounted Elixir cost. It's like a Goblin Value Pack!
  Source: https://clashroyale.fandom.com/wiki/Goblin_Gang
- **guards** (Guards): Three ruthless bone brothers with shields. Knock off their shields and all that's left are three ruthless bone brothers.
  Source: https://clashroyale.fandom.com/wiki/Guards
- **minions** (Minions): Three fast, unarmored flying attackers. Roses are red, minions are blue, they can fly, and will crush you!
  Source: https://clashroyale.fandom.com/wiki/Minions
- **skeleton-army** (Skeleton Army): Spawns an army of Skeletons. Meet Larry and his friends Harry, Gerry, Terry, Mary, etc.
  Source: https://clashroyale.fandom.com/wiki/Skeleton_Army
- **barbarians** (Barbarians): A horde of melee attackers with mean mustaches and even meaner tempers.
  Source: https://clashroyale.fandom.com/wiki/Barbarians
- **minion-horde** (Minion Horde): Six fast, unarmored flying attackers. Three's a crowd, six is a horde!
  Source: https://clashroyale.fandom.com/wiki/Minion_Horde
- **rascals** (Rascals): Spawns a mischievous trio of Rascals! The boy takes the lead, while the girls pelt enemies from behind... with slingshots full of Double Trouble Gum!
  Source: https://clashroyale.fandom.com/wiki/Rascals
- **elite-barbarians** (Elite Barbarians): Spawns a pair of leveled up Barbarians. They're like regular Barbarians, only harder, better, faster and stronger.
  Source: https://clashroyale.fandom.com/wiki/Elite_Barbarians
- **royal-recruits** (Royal Recruits): Deploys a line of recruits armed with spears, shields and wooden buckets. They dream of ponies and one day wearing metal buckets.
  Source: https://clashroyale.fandom.com/wiki/Royal_Recruits
- **little-prince** (Little Prince): Who let their nephew into the Arena?! This mischievous Royal gains Hit Speed when firing, as long as he stands still! He may look weak, but he's always being watched over from afar...
  Source: https://clashroyale.fandom.com/wiki/Little_Prince
- **golden-knight** (Golden Knight): A warrior with luxurious hair and outstanding flexibility. Demonstrates his aerobics skills on demand.
  Source: https://clashroyale.fandom.com/wiki/Golden_Knight
- **mighty-miner** (Mighty Miner): Walk softly... and carry a big drill! This Champion deals increasing Damage to his target and can switch lanes to escape combat or change attack plans. This makes him not only the mightiest, but also the sneakiest Miner in the Arena.
  Source: https://clashroyale.fandom.com/wiki/Mighty_Miner
- **skeleton-king** (Skeleton King): The King of the undead himself. He sometimes feels lonely (could be due to his non flattering features) and will summon friends to join him in the battle even after death. Tough guys have feelings too!
  Source: https://clashroyale.fandom.com/wiki/Skeleton_King
- **archer-queen** (Archer Queen): She is fast, deadly and hard to catch. Beware of her crossbow bolts and try not to blink - you might miss her!
  Source: https://clashroyale.fandom.com/wiki/Archer_Queen
- **goblinstein** (Goblinstein): It’s ALIVE! Monster lumbers towards enemy buildings while Doctor waits to spring the trap. At the press of a button, Doctor electrifies the link between himself and Monster, frying nearby enemies!
  Source: https://clashroyale.fandom.com/wiki/Goblinstein
- **monk** (Monk): Monk has spent many isolated years perfecting a new style of combat. He fires off a 3-hit combo, with the last blow dealing extra Damage and pushing enemies back!
  Source: https://clashroyale.fandom.com/wiki/Monk
- **boss-bandit** (Boss Bandit): The boss of the Forest Gang finally shows her face...kind of. Boss Bandit dashes to her targets and is invulnerable while dashing. When things get tough, her pair of grenades are at the ready.
  Source: https://clashroyale.fandom.com/wiki/Boss_Bandit
- **barbarian-barrel** (Barbarian Barrel): It rolls over and damages anything in its path, then breaks open and out pops a Barbarian! How did he get inside?!
  Source: https://clashroyale.fandom.com/wiki/Barbarian_Barrel
- **giant-snowball** (Giant Snowball): It’s HUGE! Once it began rolling down Frozen Peak, there was no stopping it. Enemies hit are knocked back and slowed down. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Giant_Snowball
- **goblin-curse** (Goblin Curse): One does not simply reverse a curse! Enemies within the curse's reach will take damage over time and be turned into Goblins after they are defeated.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Curse
- **rage** (Rage): Increases troop movement and attack speed. Buildings attack faster and summon troops quicker, too. Chaaaarge!
  Source: https://clashroyale.fandom.com/wiki/Rage
- **the-log** (The Log): A spilt bottle of Rage turned an innocent tree trunk into "The Log". Now, it seeks revenge by crushing anything in its path! Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/The_Log
- **zap** (Zap): Zaps enemies, briefly stunning them and dealing damage inside a small radius. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Zap
- **arrows** (Arrows): Arrows pepper a large area, damaging all enemies hit. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Arrows
- **clone** (Clone): Duplicates all friendly troops in the target area. Cloned troops are fragile, but pack the same punch as the original! Doesn't affect buildings.
  Source: https://clashroyale.fandom.com/wiki/Clone
- **earthquake** (Earthquake): Deals Damage per second to Troops and Crown Towers. Deals huge Building Damage! Does not affect flying units (it is an EARTHquake, after all).
  Source: https://clashroyale.fandom.com/wiki/Earthquake
- **goblin-barrel** (Goblin Barrel): Spawns three Goblins anywhere in the Arena. It's going to be a thrilling ride, boys!
  Source: https://clashroyale.fandom.com/wiki/Goblin_Barrel
- **royal-delivery** (Royal Delivery): No need to sign for this package! Dropped from the sky, it deals Area Damage to enemy Troops before delivering a Royal Recruit. The empty box is also handy for espionage.
  Source: https://clashroyale.fandom.com/wiki/Royal_Delivery
- **tornado** (Tornado): Drags enemy troops to its center while dealing damage over time, just like a magnet. A big, swirling, Tornado-y magnet.
  Source: https://clashroyale.fandom.com/wiki/Tornado
- **fireball** (Fireball): Annnnnd... Fireball. Incinerates a small area, dealing high damage. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Fireball
- **freeze** (Freeze): Freezes and damages enemy troops and buildings, making them unable to move or attack. Everybody chill. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Freeze
- **poison** (Poison): Covers the area in a deadly toxin, damaging enemy troops and buildings over time. Yet somehow leaves the grass green and healthy. Go figure! Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Poison
- **graveyard** (Graveyard): Surprise! It's a party. A Skeleton party, anywhere in the Arena. Yay!
  Source: https://clashroyale.fandom.com/wiki/Graveyard
- **void** (Void): You shall not pass! Unless there are lot of you...Creates a field of dark magic damaging all enemy troop and buildings within. More damage is dealt when fewer targets are on its area. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Void
- **lightning** (Lightning): Bolts of lightning damage and stun up to three enemy troops or buildings with the most hitpoints in the target area. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Lightning
- **rocket** (Rocket): Deals high damage to a small area. Looks really awesome doing it. Reduced damage to Crown Towers.
  Source: https://clashroyale.fandom.com/wiki/Rocket
- **cannoneer** (Cannoneer): Slow but powerful. What could be better than a giant cannon on your Tower?
  Source: https://clashroyale.fandom.com/wiki/Cannoneer
- **dagger-duchess** (Dagger Duchess): This Royal stockpiles her daggers when enemies are far away. When they dare to draw near, she unleashes her daggers in a rapid flurry! Oh, one more thing. Don't call her Princess.
  Source: https://clashroyale.fandom.com/wiki/Dagger_Duchess
- **royal-chef** (Royal Chef): Royal Chef cooks a mean Pancake and throws it to your Troop with the most Hitpoints, increasing their Level by 1. Pancakes take longer to cook when he's attacking, and he serves Troops who haven't eaten yet
  Source: https://clashroyale.fandom.com/wiki/Royal_Chef
- **tower-princess** (Tower Princess): The gold standard for Tower Troops. A Tower Princess can defend against anything, one arrow at a time.
  Source: https://clashroyale.fandom.com/wiki/Tower_Princess
- **cannon** (Cannon): Defensive building. Shoots cannonballs with deadly effect, but cannot target flying troops.
  Source: https://clashroyale.fandom.com/wiki/Cannon
- **tombstone** (Tombstone): Building that periodically spawns Skeletons to fight the enemy... and when destroyed, spawns 4 more Skeletons! Creepy.
  Source: https://clashroyale.fandom.com/wiki/Tombstone
- **bomb-tower** (Bomb Tower): Defensive building that houses a Bomber. Deals area damage to anything dumb enough to stand near it.
  Source: https://clashroyale.fandom.com/wiki/Bomb_Tower
- **goblin-cage** (Goblin Cage): When the Goblin Cage is destroyed, a Goblin Brawler is unleashed into the Arena! Goblin Brawler always skips leg day.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Cage
- **goblin-drill** (Goblin Drill): Building capable of burrowing underground and appearing anywhere in the Arena. Spawns Goblins one at a time until destroyed. Then spawns a few more, to make sure everything nearby has been properly stabbed.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Drill
- **goblin-hut** (Goblin Hut): Defensive building that spawns Spear Goblins when enemies are in range. Don't look inside... you don't want to see how they're made.
  Source: https://clashroyale.fandom.com/wiki/Goblin_Hut
- **mortar** (Mortar): Defensive building with a long range. Shoots big boulders that deal area damage, but cannot hit targets that get very close!
  Source: https://clashroyale.fandom.com/wiki/Mortar
- **tesla** (Tesla): Defensive building. Whenever it's not zapping the enemy, the power of Electrickery is best kept grounded.
  Source: https://clashroyale.fandom.com/wiki/Tesla
- **inferno-tower** (Inferno Tower): Defensive building, roasts targets for damage that increases over time. Burns through even the biggest and toughest enemies!
  Source: https://clashroyale.fandom.com/wiki/Inferno_Tower
- **barbarian-hut** (Barbarian Hut): Building that periodically spawns Barbarians to fight the enemy. Time to make the Barbarians!
  Source: https://clashroyale.fandom.com/wiki/Barbarian_Hut
- **elixir-collector** (Elixir Collector): You gotta spend Elixir to make Elixir! This building makes 8 Elixir over its Lifetime. Does not appear in your starting hand.
  Source: https://clashroyale.fandom.com/wiki/Elixir_Collector
- **x-bow** (X-Bow): Nice tower you got there. Would be a shame if this X-Bow whittled it down from this side of the Arena...
  Source: https://clashroyale.fandom.com/wiki/X-Bow
- **furnace** (Furnace): Furnace spawns one Fire Spirit at a time while dealing damage with its special cauldron brew. It also makes great brick-oven pancakes.
  Source: https://clashroyale.fandom.com/wiki/Furnace

