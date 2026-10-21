# The card reference

Every card of the catalogue, what it is (checked against the original
card render in `docs/card-art/sources/`) and how its sprite sheet is
built.

The sheets are rendered from the CC0 KayKit 3D models with a real
walk and attack clip - the character is the same model in all 20
frames. The extra bits (wings, bellies, cannons, balloons) are
primitive geometry we build ourselves.

| card | what it is | model | gear / weapon | walk | attack |
| --- | --- | --- | --- | --- | --- |
| `barbarians` | Three bare-chested warriors with moustaches, headbands and swords. | barbarian | 1H_Axe, Barbarian_Cape | `Walking_A` | `1H_Melee_Attack_Chop` |
| `archers` | Two archers with pink hair and green hoods, drawing longbows. | rogue_hooded | Rogue_Cape (+ arrow, bow, bowstring) | `Walking_A` | `1H_Ranged_Shoot` |
| `bomber` | A goggled skeleton that lobs bombs out of a barrel. | skeleton_minion | + barrel, goggle-1, goggle1 | `Walking_A` | `Throw` |
| `bats` | Three small purple bats with leathery wings. | skeleton_minion | + wing-1, wing1 | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `elite-barbarians` | Three elite warriors with spiked helmets and two-handed swords. | barbarian | 2H_Axe, Barbarian_Cape | `Walking_A` | `2H_Melee_Attack_Chop` |
| `goblins` | Three small green goblins with daggers and brown hoods. | rogue_hooded | Knife | `Walking_A` | `1H_Melee_Attack_Stab` |
| `goblin-gang` | Five goblins with daggers and spears. | rogue_hooded | Knife, Rogue_Cape | `Walking_A` | `1H_Melee_Attack_Slice_Diagonal` |
| `fire-spirit` | A small fire elemental - a burning head that spits flame. | mage | + hat | `Walking_A` | `Spellcasting` |
| `ice-spirit` | A small ice elemental - a smiling blue icicle blob. | mage | + hat | `Walking_A` | `Spellcasting` |
| `firecracker` | A girl with goggles and a shoulder rocket launcher. | rogue | + cannon | `Walking_A` | `Throw` |
| `minions` | Three small bat-winged demons with purple fur. | skeleton_minion | + wing-1, wing1 | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `knight` | An armoured knight with a sword and a red cape. | knight | 1H_Sword, Knight_Helmet, Knight_Cape | `Walking_A` | `1H_Melee_Attack_Slice_Horizontal` |
| `minion-horde` | Five bat-winged demons. | skeleton_minion | + wing-1, wing1 | `Walking_A` | `Unarmed_Melee_Attack_Punch_B` |
| `royal-giant` | A fat blond king who lobs a cannon over his shoulder. | barbarian | Barbarian_Hat (+ belly, cannon) | `Walking_A` | `Throw` |
| `royal-recruits` | Three recruits in blue helmets with swords and shields. | knight | 2H_Sword, Knight_Helmet | `Walking_A` | `2H_Melee_Attack_Chop` |
| `rascals` | A girl with a whip next to a boy with a wooden plank. | rogue | 1H_Crossbow (+ plank) | `Walking_A` | `1H_Ranged_Shooting` |
| `spear-goblins` | Three goblins with spears. | rogue_hooded | arrow | `Walking_A` | `Throw` |
| `skeleton-barrel` | A barrel of skeletons lifted by two balloons. | skeleton_minion | + balloon, barrel, rope | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `skeletons` | Four skeletons with rusty swords. | skeleton_warrior | Skeleton_Warrior_Helmet, Skeleton_Blade | `Walking_A` | `1H_Melee_Attack_Slice_Horizontal` |
| `battle-ram` | A battering ram: a spiked log on a wheeled frame. | barbarian | + ram | `Walking_A` | `2H_Melee_Attack_Chop` |
| `dart-goblin` | A goblin with a blowgun. | rogue_hooded | crossbow_1handed | `Walking_A` | `1H_Ranged_Shoot` |
| `elixir-golem` | A fat purple golem made of elixir. | barbarian | + belly | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `flying-machine` | A wooden flying machine with a propeller. | skeleton_minion | + body, prop | `Walking_A` | `Unarmed_Melee_Attack_Kick` |
| `goblin-demolisher` | A goblin riding a demolition machine loaded with dynamite. | rogue_hooded | Knife (+ stick, tank) | `Walking_A` | `Throw` |
| `giant` | A huge, fat, bare-chested man with a wide belt. | barbarian | + belly | `Walking_A` | `1H_Melee_Attack_Chop` |
| `hog-rider` | A man riding a war hog with a hammer. | barbarian | 1H_Axe (+ hog) | `Walking_A` | `1H_Melee_Attack_Slice_Horizontal` |
| `mini-pekka` | A small armoured fighter with glowing blue blades. | knight | Knight_Helmet (+ horn-1, horn1) | `Walking_A` | `2H_Melee_Attack_Spin` |
| `ice-golem` | A big ice golem with icicles on its shoulders. | barbarian | + plate-1, plate1 | `Walking_A` | `Unarmed_Melee_Attack_Punch_B` |
| `musketeer` | A woman with a purple bob cut and a heavy musket. | rogue | + musket | `Walking_A` | `1H_Ranged_Shoot` |
| `royal-hogs` | Four war hogs wearing blue helmets. | barbarian | + helmet, hog | `Walking_A` | `1H_Melee_Attack_Stab` |
| `wizard` | A bearded wizard in a blue robe casting a fire spell. | mage | 2H_Staff, Mage_Hat, Mage_Cape | `Walking_A` | `Spellcast_Long` |
| `valkyrie` | A red-haired woman with a big axe. | barbarian | 2H_Axe, Barbarian_Hat (+ crown0, crown1, crown2) | `Walking_A` | `2H_Melee_Attack_Spin` |
| `zappies` | Three small goblin-like zappers with electric arcs. | skeleton_minion | + antenna, cap | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `baby-dragon` | A small green dragon with wings and a tail. | mage | + tail, wing-1, wing1 | `Walking_A` | `Spellcasting` |
| `bowler` | A fat purple man who throws a huge boulder. | barbarian | + belly | `Walking_A` | `Throw` |
| `dark-prince` | A black-armoured prince with a spike shield and a plume. | knight | 2H_Sword, Knight_Helmet, Knight_Cape | `Walking_A` | `2H_Melee_Attack_Spin` |
| `balloon` | A skeleton riding in a hot air balloon. | skeleton_minion | + balloon, rope | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `electro-dragon` | A blue dragon that shoots lightning. | mage | + tail, wing-1, wing1 | `Walking_A` | `Spellcasting` |
| `giant-skeleton` | A giant skeleton with a helmet and a bomb in its hand. | skeleton_warrior | Skeleton_Warrior_Helmet, Skeleton_Blade (+ bomb) | `Walking_A` | `2H_Melee_Attack_Chop` |
| `goblin-giant` | A huge goblin in blue overalls with a spear. | rogue_hooded | Knife (+ belly) | `Walking_A` | `1H_Melee_Attack_Chop` |
| `executioner` | A masked executioner swinging a huge axe. | barbarian | 2H_Axe, Barbarian_Hat (+ mask) | `Walking_A` | `2H_Melee_Attack_Chop` |
| `pekka` | A big armoured fighter with pink horns and a giant sword. | knight | Knight_Helmet (+ horn-1, horn1) | `Walking_A` | `2H_Melee_Attack_Spin` |
| `guards` | Two skeletons with spears and a shield. | skeleton_warrior | Skeleton_Blade (+ shield) | `Walking_A` | `1H_Melee_Attack_Stab` |
| `prince` | A golden prince with a lance and a crown. | knight | 2H_Sword, Knight_Helmet, Knight_Cape (+ crown0, crown1, crown2) | `Walking_A` | `2H_Melee_Attack_Spin` |
| `golem` | A stone golem with a glowing purple core and blue crystals. | barbarian | + core, plate-1, plate1 | `Walking_A` | `Unarmed_Melee_Attack_Punch_B` |
| `skeleton-army` | A horde of skeletons with swords. | skeleton_warrior | Skeleton_Blade | `Walking_A` | `1H_Melee_Attack_Slice_Horizontal` |
| `witch` | A dark witch in a purple dress raising her skeletal hand. | mage | Spellbook_open, Mage_Hat, Mage_Cape | `Walking_A` | `Spellcast_Long` |
| `fisherman` | A man with a fishing rod and a fish on the line. | barbarian | arrow | `Walking_A` | `1H_Melee_Attack_Stab` |
| `bandit` | A masked bandit with a dagger. | rogue | Knife, Rogue_Cape | `Walking_A` | `1H_Melee_Attack_Stab` |
| `electro-wizard` | A wizard whose staff crackles with electricity. | mage | 2H_Staff, Mage_Hat | `Walking_A` | `Spellcasting` |
| `inferno-dragon` | A dragon that breathes a stream of fire. | mage | + tail, wing-1, wing1 | `Walking_A` | `Spellcasting` |
| `lava-hound` | A lava hound with a molten body. | barbarian | + body, head | `Walking_A` | `1H_Melee_Attack_Chop` |
| `ice-wizard` | An ice wizard throwing a shard of ice. | mage | 2H_Staff, Mage_Hat | `Walking_A` | `Spellcast_Long` |
| `lumberjack` | A lumberjack swinging a huge axe. | barbarian | 2H_Axe | `Walking_A` | `2H_Melee_Attack_Chop` |
| `mega-knight` | A huge armoured knight with a two-handed sword. | knight | 2H_Sword, Knight_Helmet, Knight_Cape | `Walking_A` | `2H_Melee_Attack_Spin` |
| `magic-archer` | An archer with a bow of purple energy. | rogue_hooded | Rogue_Cape (+ arrow, bow, bowstring) | `Walking_A` | `1H_Ranged_Shoot` |
| `mother-witch` | A witch with a spellbook and a broom. | mage | Spellbook_open, Mage_Hat, Mage_Cape | `Walking_A` | `Spellcast_Long` |
| `night-witch` | A witch with a horned hat and a wand. | mage | 1H_Wand, Mage_Hat | `Walking_A` | `Spellcasting` |
| `phoenix` | A fiery bird with burning wings. | mage | + tail, wing-1, wing1 | `Walking_A` | `Spellcast_Raise` |
| `princess` | An archer princess with a bow and a golden crown. | rogue_hooded | + arrow, bow, bowstring, crown | `Walking_A` | `1H_Ranged_Shoot` |
| `ram-rider` | A man on a ram with a lance. | barbarian | + ram | `Walking_A` | `2H_Melee_Attack_Spin` |
| `miner` | A miner with a pickaxe. | barbarian | + handle, pick | `Walking_A` | `1H_Melee_Attack_Chop` |
| `archer-queen` | The archer queen with a bow and a crown. | rogue_hooded | + arrow, bow, bowstring, crown | `Walking_A` | `1H_Ranged_Shooting` |
| `sparky` | A wizard with a crackling spark on his hat. | mage | Mage_Hat, 1H_Wand | `Walking_A` | `Spellcast_Raise` |
| `royal-ghost` | A transparent ghostly king with a crown. | mage | 2H_Staff, Mage_Hat | `Walking_A` | `Spellcasting` |
| `boss-bandit` | A big bandit with two daggers. | rogue | Knife, Knife_Offhand, Rogue_Cape | `Walking_A` | `Dualwield_Melee_Attack_Slice` |
| `golden-knight` | A golden knight with a sword and a shield. | knight | 2H_Sword, Knight_Helmet, Knight_Cape | `Walking_A` | `2H_Melee_Attack_Spin` |
| `little-prince` | A small prince with a crossbow and a crown. | rogue_hooded | + crown | `Walking_A` | `1H_Ranged_Shoot` |
| `goblinstein` | A Frankenstein goblin, stitched together and huge. | rogue_hooded | Knife, Rogue_Cape (+ belly) | `Walking_A` | `1H_Melee_Attack_Chop` |
| `mighty-miner` | A mighty miner with a pickaxe and a moustache. | barbarian | + handle, pick | `Walking_A` | `1H_Melee_Attack_Chop` |
| `monk` | A bald monk in an orange robe. | mage | Mage_Cape | `Walking_A` | `Unarmed_Melee_Attack_Punch_A` |
| `skeleton-king` | A skeleton king with a crown and a staff. | skeleton_warrior | Skeleton_Warrior_Helmet, Skeleton_Staff | `Walking_A` | `Spellcast_Long` |
| `furnace` | A stone furnace that spits fire. | procedural | - | `-` | `-` |
| `cannon` | A cannon on a wooden carriage with two wheels. | procedural | - | `-` | `-` |
| `tesla` | A buried tesla coil that fires lightning. | procedural | - | `-` | `-` |
| `mortar` | A mortar that lobs shells at the enemy tower. | procedural | - | `-` | `-` |
| `barbarian-hut` | A wooden hut where barbarians spawn. | procedural | - | `-` | `-` |
| `goblin-hut` | A green goblin hut. | procedural | - | `-` | `-` |
| `goblin-cage` | A cage that drops goblins on the enemy side. | procedural | - | `-` | `-` |
| `bomb-tower` | A tower that drops bombs on the enemy tower. | procedural | - | `-` | `-` |
| `inferno-tower` | A tower that breathes a stream of fire. | procedural | - | `-` | `-` |
| `elixir-collector` | A tank that collects elixir and spawns a golem. | procedural | - | `-` | `-` |
| `tombstone` | A tombstone that spawns skeletons. | procedural | - | `-` | `-` |
| `goblin-drill` | A drill that burrows under the bridge. | procedural | - | `-` | `-` |
| `x-bow` | A crossbow that fires two bolts at a time. | procedural | - | `-` | `-` |
| `arrows` | A volley of arrows raining down on an area. | procedural | - | `-` | `-` |
| `fireball` | A big fireball that explodes in a burst of flame. | procedural | - | `-` | `-` |
| `giant-snowball` | A giant snowball that freezes everything it hits. | procedural | - | `-` | `-` |
| `zap` | A lightning zap that stuns and destroys small troops. | procedural | - | `-` | `-` |
| `barbarian-barrel` | A barrel of barbarians that explodes into a horde. | procedural | - | `-` | `-` |
| `goblin-barrel` | A barrel of goblins that hops onto the arena. | procedural | - | `-` | `-` |
| `earthquake` | An earthquake that shakes the ground and slows the troops. | procedural | - | `-` | `-` |
| `royal-delivery` | A royal delivery box that drops three recruits. | procedural | - | `-` | `-` |
| `freeze` | A freeze that locks a whole area in ice. | procedural | - | `-` | `-` |
| `clone` | A clone spell that copies the last card played. | procedural | - | `-` | `-` |
| `rocket` | A rocket that flies over the units and hits the tower. | procedural | - | `-` | `-` |
| `goblin-curse` | A curse that turns the enemy troops into goblins. | procedural | - | `-` | `-` |
| `lightning` | A lightning strike that stuns and damages a big area. | procedural | - | `-` | `-` |
| `poison` | A poison cloud that keeps damaging and slowing the troops. | procedural | - | `-` | `-` |
| `tornado` | A tornado that drags the troops around. | procedural | - | `-` | `-` |
| `rage` | A rage spell that makes the troops furious and faster. | procedural | - | `-` | `-` |
| `void` | A void that swallows the troops and the buildings. | procedural | - | `-` | `-` |
| `the-log` | A rolling log that knocks down the troops in its way. | procedural | - | `-` | `-` |
| `graveyard` | A graveyard that spawns skeletons on the field. | procedural | - | `-` | `-` |
| `tower-princess` | The red princess tower with a red roof. | procedural | - | `-` | `-` |
| `dagger-duchess` | The blue dagger duchess tower. | procedural | - | `-` | `-` |
| `cannoneer` | A cannon tower that shoots at the enemy. | procedural | - | `-` | `-` |
| `royal-chef` | The royal chef tower. | procedural | - | `-` | `-` |
