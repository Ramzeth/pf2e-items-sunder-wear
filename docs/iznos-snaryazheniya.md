# Equipment wear

Homebrew for PF2e Remaster. Campaign: *Crown of the Kobold King*, levels 1–6, permadeath, roguelike delves.

**The goal:** make Crafting/Repair worth having, and give the party a reason to go back to town other than shopping.

**The implementation:** the Foundry module **PF2e Items — Sunder & Wear**, a fork of [PF2e Aztec's Sundered](https://github.com/Tebesski/pf2e-aztecs-sundered). This document describes the system as it exists in the code, and is the source of truth the tests in `test/` are written against. Weapons and armour run on the same rules and differ only in their triggers and their numbers, so they share one document.

---

## 1. Terms

| Term | What it is | Where it lives |
|---|---|---|
| **Base** | The maximum HP the item left the forge with. Wear never touches it. | `flags.world.maxHp` |
| **Repair limit** | The ceiling the item can currently be repaired to. Field repair lowers it; only a town forge restores it. | `flags.world.repairLimit`, no flag = "at Base" |
| **Current HP** | What it has left right now. | `flags.world.currentHp` |
| **BT** | Broken threshold. **25% of Base** for weapons, **50%** for armour. Fixed. | derived |
| **Fatigue** | The name of the process by which the repair limit falls. A rules term, not something said at the table. | — |
| **Rune Hardness** | The rank of the potency rune. Reduces wear damage. Not to be confused with material Hardness. | the item's rune |

```
current HP  ≤  repair limit  ≤  Base
```

**Material Hardness is ignored for wear** — otherwise a `d4` would never get through anything metal, and the rule would quietly stop existing exactly where it applies most often.

**BT is measured from Base and does not follow the limit down.** This is not cosmetic: a fixed threshold means the gap between the limit and BT is squeezed from above, a tired item breaks more and more often, and once the gap falls below one point field repair becomes impossible. A threshold measured from the limit would hold that gap constant, and nothing would ever wear out.

**Base can be edited by hand** in the durability window, for unique items that are not on the material ladder. A blade given a Base of 30 derives its BT and its mod from thirty, and a town forge repairs it to thirty.

**Changing the material is a remake.** The item comes back new: Base is recalculated, HP go to full, and accumulated fatigue is wiped.

---

## 2. Triggers

| Event | What wears | Damage |
|---|---|---|
| **Natural 1** on an attack roll | the attacker's weapon | `1d4` |
| **Critical hit** against the wearer | the target's worn armour | `1d4` |
| **Any strike with a broken weapon** | that weapon | **a flat 1 HP** |

Rune Hardness is subtracted from the die (minimum 0) and is **not** subtracted from the flat cost of a strike.

A natural 1 is caught on the **die**, not on the outcome: with a large modifier a one may not produce a critical failure by the numbers, but the rule fires anyway. A critical against armour is caught on the **outcome** instead — that rule is about the blow landing hard.

**There is no floor.** Wear damage lands in full, and an item with little HP left can go to zero in a single trigger. The fragility of light materials is the point, and it is tuned by which material the item has, not by capping the damage.

At or below BT the item is **broken** (RAW). **At 0 HP it is destroyed permanently.**

### Outside the system

- **shields** — they already have their own attrition through Shield Block, so the module leaves them the broken threshold PF2e gives them;
- **armour with no item bonus to AC** — a mage's robe, explorer's clothing: they exist to carry runes, and there is nothing to wear down;
- **unarmed attacks** — a fist is a `weapon`-type item in PF2e, but it is not equipment;
- **NPC strikes** — those are `melee`, not `weapon`, and the system does not see them. Deliberate: this campaign is about the party's gear.

---

## 3. Striking with a broken weapon

A character may use what is left of a broken weapon. **Every strike costs the weapon 1 damage**, flat, with no roll and no rune Hardness subtracted.

A steel blade at BT 5 is good for **5 strikes** — a number the player can count on when deciding whether to finish the delve on the stump of a sword or turn back.

**A natural 1 with a broken weapon still fires.** The cost is doubled: 1 for the strike and `1d4` on top for the fumble. So five strikes is the best case, not the expected one — one natural 1 on any of them and the blade is gone on the spot. Fighting with a broken weapon stays a gamble rather than a countdown.

A miss counts as a strike. Otherwise "five swings" would depend on the enemy's AC and stop being a number anybody could work out.

This is the route by which wear takes a **weapon** to zero. Armour gets there differently — it is worn while broken, and it keeps catching criticals on the same `d4`.

---

## 4. Materials

**`mod` is the difficulty of field repair:** the share of the damage that patching it up in the field does **not** give back, ever. It is not a rate of decay — an item does not grind itself down over time, it loses limit only when somebody repairs it.

Retie a rope and it is as good as new: `mod 0.20`, the field gives almost everything back. Steel wants a forge, and a field patch eats half of it: `mod 0.50`. The harder the material, the less a campfire and a hammer can recover.

The durability ladders are taken from the module.

### Weapons: `mod = Base / 40`

| Base | BT | **mod** | Weapons |
|---|---|---|---|
| 8 | 2 | **0.20** | whip, scorpion whip, bola, sap, flail, rope dart |
| 12 | 3 | **0.30** | shortbow, longbow, crossbow, hand crossbow, sling, blowgun, club, spear, dart, boomerang, scythe |
| 16 | 4 | **0.40** | heavy crossbow, wakizashi, repeating crossbow |
| 20 | 5 | **0.50** | **everything metal** (swords, axes, flails, daggers, hammers), staff, bo staff, longspear, polearms |

### Armour: `mod = Base / 80`

| Base | BT | **mod** | Armour |
|---|---|---|---|
| 12 | 6 | **0.15** | padded, gi, clothing |
| 16 | 8 | **0.20** | leather, studded leather, hide |
| 20 | 10 | **0.25** | chain shirt, wooden breastplate |
| 28 | 14 | **0.35** | chain mail, ceramic, coral |
| 36 | 18 | **0.45** | breastplate, scale, o-yoroi |
| 40 | 20 | **0.50** | full plate, half plate, splint, hellknight |

The highest mod in either system is exactly **0.50** — metal weapons (Base 20 over a divisor of 40) and full plate (Base 40 over 80).

The ladder is physically arbitrary: "wood" and "stone" work as durability steps in the module rather than as literal materials. Do not try to justify it to the players through realism.

**Precious materials** (adamantine, dawnsilver, cold iron) use the same formula, and their `mod` comes out **higher**, not lower: a bigger Base over the same divisor. The direction is right — adamantine should not repair nicely in a forest. What happens at the top of that range is covered by "An expensive item needs a master" in §7.

### Why BT differs

A broken weapon takes a character out of the fight; broken armour does not. By RAW broken armour **keeps its item bonus to AC** and takes a status penalty by category: −1 light, −2 medium, −3 heavy. The same word "broken" means catastrophe for a sword and inconvenience for a suit of armour, so weapons are given a lot of room below the threshold and armour very little.

---

## 5. Runes: Hardness

| Rune | Hardness | Average damage | Triggers | Attacks |
|---|---|---|---|---|
| none | 0 | 2.50 | 11 | **~225** |
| **+1** | 1 | 1.50 | 19 | **~375** |
| **+2** | 2 | 0.75 | 38 | **~750** |
| **+3** | 3 | 0.25 | 112 | **~2250** |

At levels 1–6 a party will only see `+1`, and possibly `+2` towards the end. They will not wear out their first runed blade over the whole campaign — and that correctly feels like a reward.

**Armour potency works exactly like weapon potency.** The rules do not spell this out, but without it runed armour would wear down as fast as plain armour while a runed blade does not, and the two halves of the system would drift apart for no reason.

**Rune Hardness does not depend on the item's condition.** The module suppresses the mechanical effect of runes when an item breaks, but the rune is still on the item and still blunts wear. This matters more for armour than for weapons: broken armour keeps being worn, and keeps catching criticals every fight.

> **A caveat about RAW.** Suppressing the runes of a broken item is the module's homebrew, not a PF2e rule. By RAW a broken item cannot be used for its purpose and grants no bonuses, but nothing is said about runes disappearing, and broken armour explicitly keeps its item bonus to AC.
>
> So suppression is **off by default**: the `suppressArmour*` and `suppressWeapon*` settings. They used to ship on, which meant the module argued with the rulebook out of the box.

---

## 6. Fatigue: the formula

On a **field** repair:

```
limit lost = (repair limit − current HP) × mod × k
```

- The whole part is taken for certain
- **The fraction is a chance at one more point.** A loss of 7.5 means minus 7, plus a 50% chance at the eighth, rolled on `1d100`
- The repair limit never falls below BT
- **Cut-off:** once `limit − BT < 1`, field repair is no longer possible — only a town forge

`k` is the quality grade of the work; see §7. Before the grade ladder existed there was an outcome multiplier here instead, which said the same thing a second time.

The worse the shape an item is in when it is patched, the more of its future goes into the patch. Topping up a scratch is nearly free; dragging something back from the brink is what wears it out for good. That is where the choice at the table comes from: repair now, or hold out until town.

Rolling the fraction gives an exact expectation with no bias. Rounding down would quietly favour light materials — they take many small losses where heavy ones take few large ones, and the parity of the ladder is tuned on the average.

The repair limit itself is always a **whole number**. The fractional values in the tables below are expectations, shown to illustrate the curve, not numbers that appear at the table.

---

## 7. Repair

### In the field: a chain of chat cards

Repairing somebody else's gear is two different roles with two different permissions, and no one participant holds both. The roll needs the smith's character; writing HP needs the item's owner. So a repair happens as a conversation in chat:

```
Owner: durability window → [ Request repair ]
   ↓
Request card: item, level, DC, HP / limit / Base
   └─ [ Repair this ] ← anybody with a character
        ↓ window: who repairs, at which grade, forecast of DC and limit lost
        ↓ toolkit check, their own Crafting roll
Result card: grade, final DC, outcome and repair budget
   └─ [ Apply repair ] ← the item's owner and the GM
        ↓
Card: limit, HP, time spent
```

Everybody acts strictly within their own rights, and no socket relay is needed.

**A request is consent to reveal the item.** A smith cannot see somebody else's inventory, so the owner is the one who puts the numbers on the card. A table where players deliberately do not know each other's gear keeps working.

Along with HP, the limit and the Base, the card carries `mod` and BT — the two quantities a repair is priced with. Without them the grade window could not show the smith what fine work would cost, and it has no right to read the item directly. The numbers in the forecast are a **snapshot**: while the card sits in chat the sword may have taken another hit. The real ones are read fresh at the moment of application, which is the only place they matter.

**What comes from where.** From the card, only the outcome and the repair budget: whoever applies it cannot see the smith's sheet and has no way to know what an expert with a Crafter's Eyepiece was worth. The item's condition is read **fresh** when the repair lands — between the roll and the click the sword may have been hit again, and healing from a stale number would hand back HP it has since lost.

**A toolkit** is required by RAW and is checked on whoever is doing the work.

**Re-rolls:** the "Repair this" button goes out after the first press. If a second attempt is wanted, the owner publishes a new request. That is fair: a retry costs another ten minutes, and the failure has already been paid for in limit.

### The quality ladder

The repairer chooses how finely to work, and pays for fineness with a higher DC. The grade scales the material's `mod`:

```
effective mod = (Base / divisor) × k
```

| Grade | k | DC | Requires |
|---|---|---|---|
| Abysmal | 1.5 | — | only by stepping down |
| Rough | 1.00 | +0 | untrained |
| Neat | 0.66 | +2 | trained |
| Fine | 0.45 | +4 | expert |
| Jeweller's | 0.30 | +7 | master |
| Flawless | 0.20 | +10 | legendary |
| Absolute | 0 | — | only by stepping up |

The two outer grades cannot be chosen: a critical failure drops you to Abysmal, a critical success lifts you to Absolute. The `k` of 0 at the top is what makes it the one free repair in the system.

**`k` is geometric — ×1.5 between neighbours, and that is not decoration.** What decides whether a grade is worth buying is the **ratio** to the one above it, not the difference. An evenly spaced 1.0 / 0.8 / 0.6 / 0.4 / 0.2 gets cheaper with every step (×1.25, ×1.33, ×1.5, ×2.0) while each step costs the same DC — the top grade becomes the only sane purchase and the middle of the ladder dies. Over 100 000 item lifetimes per cell, Jeweller's on that ladder was optimal at **no deficit at all**.

**The DC schedule was found the same way.** A grade lives on the gap to the **next one up**, not the gap below it: making Fine dearer to enter (+5) kills it, making its exit dearer (+7 for Jeweller's) gives it the widest band on the ladder. At `+0/+2/+4/+7/+10` every grade is optimal on at least three deficits for both a Base 20 weapon and a Base 8 one, and the reference point — a repairer facing a DC ten above their modifier — lands on Fine.

Checked by `test/balance-tables.mjs`, which reads the ladder straight out of the code.

### Outcomes

| Result | Grade | HP | Repair limit |
|---|---|---|---|
| **Critical success** | **one step up** | restored | falls at the new grade |
| **Success** | as chosen | restored | falls by the formula |
| **Failure** | as chosen | not restored | **falls by the formula** |
| **Critical failure** | **one step down** | **−1 HP, past any Hardness** | falls at the new grade |

**Order: the limit falls first, then the HP heal.** The limit is spent against the state the item was in **before** the repair, and the healing goes to whatever ceiling is left. The other way round would be a gift — the item would get HP it was never entitled to.

**A critical success is no longer free in itself.** It used to leave the limit alone at any grade; now it delivers one grade finer, and it comes out free only from Flawless, where the step up lands on Absolute. A lucky bodger gets neat work, not a miracle. Every balance table was computed on this.

**A critical failure is a failure plus −1 HP.** The limit falls as it would on a plain failure, and on top of that the item loses a single point of health — **flat, not a die, and past Hardness of every kind**: neither the material nor the rune protects against it. The one place in the system where a rune buys nothing.

The doubled limit loss that used to sit here was far too sharp: at a limit of 12 on a battered blade it took the item straight to its broken threshold on one roll, with no warning and nothing to be done about it. Damage is the gentler and more interesting punishment, because it **can be repaired again**, where a lost limit never comes back.

**Why not a die.** A `1d4` stood here first — the same one a natural 1 uses in combat. It does not scale with the item: for a whip or a club at 4 HP it is the whole remainder, and a natural 1 is not removable by any amount of skill. Over 100 000 simulated item lifetimes, a legendary smith at zero deficit still destroyed 20% of light weapons on the bench — more than a careless one destroyed heavy ones. A flat point costs the same everywhere: the same cell gives 0.0–0.1%, and the punishment has not gone anywhere — what bleeds an item out is a string of attempts beyond your skill, not any single roll.

The rune was dropped for the same reason: subtracting Hardness 2 from a single point leaves zero, which would make a runed item immune to spoiled work. A rule that does nothing is worse than no rule. As fiction it is also fair: a rune takes blows, and this is not a blow — this is the smith's file slipping.

The RAW critical failure (`2d6` against Hardness) is not used: against steel's Hardness 9 it would almost always come out at zero, which after the subtraction would make it **gentler than a plain failure**.

**Why failure punishes at all:** an untrained character will not volunteer to fix the party's runed sword, because failing costs more than not repairing it. The skill acquires an owner.

### One check repairs fully

A departure from RAW, **on by default**: any successful attempt restores the item straight to its repair limit, whatever the repairer's rank. By the book you would re-roll the same check over and over until fixed batches of 10 HP closed the gap.

The balance of this system rests on the **limit**, not on a count of re-rolls. Repeating the roll decides nothing — the outcome is a foregone conclusion, it will work eventually — it is only a tax on the table's patience.

Failure is unaffected: zero restored in either mode.

**The time stays real, though.** Repair is a ten-minute exploration activity, and collapsing the re-rolls does not make the work instant:

```
time = (restored / one attempt's budget) × 10 minutes
```

Full plate from 5 HP to a limit of 40 in an expert's hands is 35 HP and **35 minutes of camp**. A failure costs 10 minutes: fruitless fiddling is still fiddling.

**Time is linear, with no rounding up.** Rounding to whole ten-minute spans charged a smith who got one hit point back the same as one who got ten — and that hid exactly what the crude grades are good for: they succeed more often and finish sooner. A single restored hit point costs a minute.

There is still exactly one attempt: one click, one check. The division in the formula is a way to work out a duration, not a count of rolls, and only the duration is printed on the card, so that nothing describes a scene that never happened.

Re-rolls leave the table this way, but their cost in game time stays. On a delve with limited resources that matters more than the HP.

### An expensive item needs a master

A grade returns anything at all only while `mod × k < 1`. Once the product reaches one, the limit falls by exactly as much damage as the item is carrying, the new ceiling lands **at or below the item's current HP**, and there is nothing left to repair — ten minutes of work, the limit collapsed to BT, zero HP to show for it, and that is permanent.

Base thresholds for weapons (divisor 40):

| Grade | highest Base |
|---|---|
| Rough | **40** |
| Neat | 61 |
| Fine | 89 |
| Jeweller's | 133 |
| Flawless | 200 |

Rough work stops working at **Base 40** — adamantine standard, and cold iron, noqual, siccatite and abysium at high grade. Orichalcum (64) takes neither rough nor neat work: it needs an expert at minimum. Armour is untouched — its divisor is 80 and the best armour in the book is 72.

**This is a rule, not a defect.** The grade stays in the list and is not blocked: the forecast says plainly that it will restore 0 HP and warns on a line of its own. Hiding the grade would hide the rule — a player should see that an expensive thing cannot be patched on a knee, and should be able to ruin it anyway if they really want to.

### In town

Full restoration of HP **and of the repair limit, to Base**. Money and a day.

**Not automated in code, and it does not need to be.** The GM opens the durability window and sets the repair limit and current HP to the Base. A limit that reaches Base deletes its own flag, so the item returns to the state "never repaired in the field" with no residue in the data.

It is tempting to write this up as a ritual, but a ritual in PF2e is a compendium entry with a level, a cost and secondary casters — a description of what happens. The GM sets the numbers either way, and a dedicated button would add nothing.

**Breggin Torvel, the Straightener** — a saw-setter at the Butchering Yard, repairs cheaper than the Consortium's forge. In phase 3 of the social front he may refuse anyone on Creed's side.

---

## 8. The arithmetic

> Every figure in this section was computed under the old rule with a floor at BT, and needs recomputing. Without the floor an item crosses the threshold a little sooner and loses part of the remainder; light armour suffers most, as it can skip past the threshold on a single critical.

### Weapons

A natural 1 is **5% of rolls** = one trigger per 20 attacks.

| Weapon | Base | BT | mod | Field repairs | Triggers | **Attacks per lifetime** |
|---|---|---|---|---|---|---|
| Whip, bola, sap | 8 | 2 | 0.20 | 8 | 10.4 | **~208** |
| Bow, crossbow, spear, club | 12 | 3 | 0.30 | 6 | 11.0 | **~220** |
| Heavy crossbow | 16 | 4 | 0.40 | 4 | 11.1 | **~221** |
| Metal, staff, polearms | 20 | 5 | 0.50 | 3 | 11.2 | **~225** |

Parity at 208–225 attacks, an 8% spread.

### Armour

| Armour | Base | BT | mod | Field repairs | **Criticals per lifetime** |
|---|---|---|---|---|---|
| Padded, gi, clothing | 12 | 6 | 0.15 | 11 | **13.7** |
| Leather, studded, hide | 16 | 8 | 0.20 | 9 | **14.3** |
| Chain shirt, wooden breastplate | 20 | 10 | 0.25 | 8 | **14.8** |
| Chain mail, ceramic, coral | 28 | 14 | 0.35 | 6 | **15.2** |
| Breastplate, scale, o-yoroi | 36 | 18 | 0.45 | 4 | **15.2** |
| Full plate, half plate, splint, hellknight | 40 | 20 | 0.50 | 4 | **15.5** |

Parity at 13.7–15.5 criticals — a 13% spread across bases that differ by a factor of 3.3.

**The flavour is in the number of repairs, not in the lifetime:** padded armour is stitched up after every scrap (11 times), full plate is straightened four times in a campaign and after that it is the forge only. The outcome is the same; the feel is not.

### The life of a steel sword (20 / 5 / 0.50)

| Cycle | Limit | Attacks until broken | Loss |
|---|---|---|---|
| 1 | 20 | **120** | −7.5 → 12.5 |
| 2 | 12.5 | 60 | −3.75 → 8.75 |
| 3 | 8.75 | 30 | −1.9 → 6.9 |
| 4 | 6.9 | 15 | gap < 1, town only |

### The life of full plate (40 / 20 / 0.50)

| Cycle | Limit | Criticals until broken | Loss |
|---|---|---|---|
| 1 | 40 | **8** | −10 → 30 |
| 2 | 30 | 4 | −5 → 25 |
| 3 | 25 | 2 | −2.5 → 22.5 |
| 4 | 22.5 | 1 | −1.25 → 21.25 |
| 5 | 21.25 | 0.5 | gap < 1, town only |

Heavy armour holds almost all of its resource in the first cycle and runs out quickly after the first repair. Light armour is spread evenly.

### In sessions

A martial makes **30–40 attack rolls per session**.

| Role | Criticals per session | Armour | **Sessions to exhaustion** |
|---|---|---|---|
| Frontliner | ~2 | full plate | **7–8** |
| Second rank | ~1 | chain mail | ~15 |
| Caster | ~0.3 | padded | 40+ |

A martial's weapon: first break after **3 sessions**, field repair fully exhausted after **6–7**. With a `+1` rune, twice as long — to the end of the campaign.

Both kits run out roughly at the end of a 1–6 campaign, the weapon slightly sooner.

---

## 9. Module settings

Everything sits under the master switch "Enable equipment wear", which is **off by default**. While it is off the module behaves exactly as it did before the system existed: BT is 50% of maximum again, and there are no extra fields or flags on items.

| Setting | Default | What it moves |
|---|---|---|
| Wear: weapons | on | the natural 1 trigger |
| Wear: armour | on | the critical-against-the-wearer trigger |
| One check repairs fully | on | §7; off gives RAW with fixed restoration |
| Wear damage | `1d4` | rolled when a trigger fires in combat; `1d6` is faster. Does not touch a critical failure on a repair — that is always 1 |
| Cost of a strike with a broken weapon | 1 | §3; 0 means striking is free |
| Weapon fatigue divisor | 40 | `mod = Base / divisor`; larger means more repairs |
| Armour fatigue divisor | 80 | the same |
| Weapon broken threshold | 25% | BT as a percentage of Base |
| Armour broken threshold | 50% | the same |
| Light / medium / heavy armour penalties | −1 / −2 / −3 | the status penalty to AC while broken |
| Suppress runes when broken | off | §5; not RAW, but available |

---

## 10. Implementation status

| Rule | Code |
|---|---|
| Base, repair limit, BT from Base | done, covered by tests |
| Rune Hardness, including on a broken item | done, covered by tests |
| Wear damage with no floor | done, covered by tests |
| Strikes with a broken weapon | done, covered by tests |
| Remake on a change of material | done |
| Triggers: natural 1, critical on the wearer, broken strike | done |
| The fatigue formula, the fractional chance, the cut-off | done, covered by tests |
| Field repair: request, roll, application, time | done, covered by tests |
| The quality ladder: seven grades, the shift on criticals | done, covered by tests |
| Grade selection and the forecast in both repair windows | done |
| Linear repair time | done, covered by tests |
| "An expensive item needs a master" | done, covered by tests |
| Town repair | by the GM's hand; automation is not wanted |

Parsing PF2e's messages — the paths to the die, to the target, to the worn armour — is not covered by tests: it needs a live world. It is kept in a thin layer of its own so that a fix after a system update lands in one place.

---

## 11. Open questions

- **Monks and casters pay nothing.** A possible answer: a critical-failure card as their version of the cost. With no choice offered — simply in place of damage to a weapon.
- **There is no choice in combat.** Deliberate: the choice is made at camp (repair / endure / leave), and that is enough. A "card or damage" fork was left out — a deferred cost always loses to an immediate one, and it would eat the table's pace.
- **A whip at mod 0.20 gives 8 repair cycles** — a lot of fuss for a rare weapon. Round it off to "repair it until you get bored".
- **Padded armour with no floor.** Base 12 and up to 4 damage per critical mean an intact padded jacket at 4 HP goes to zero. Watch at the table whether light armour stops existing too quickly.
- **What a broken blade is worth.** A broken weapon currently pays −2 to attack and damage plus 1 HP per strike, but keeps its runes. Check whether that is too soft or too harsh: the one place both numbers meet is the moment the party decides whether to finish the delve on the stump of a sword or leave.
- **Wearing broken armour** is the only route to destroying it. Check whether that turns into a trap for players who simply did not notice the condition.
- **Shields** are left on RAW with their own Shield Block. If the system is ever extended to them, mod is computed the same way.

### ✔ Precious materials above `mod 1.00` — closed by the ladder

Resolved: see "An expensive item needs a master" in §7.

The question was this: `mod` grows linearly with Base, the Bases of precious materials run far past the 8–20 ladder the formula was tuned on, and nine of them step over one — from `1.00` for adamantine standard to `1.60` for orichalcum. At `mod ≥ 1` a field repair took at least as much limit as it returned HP, so repairing was strictly worse than not repairing. The repair button was a trap.

The quality ladder answered it without touching a single formula: the figure is now `mod × k`, and a grade whose product has reached one simply does nothing on that item. Instead of "a hard material broke the system" the result is "a hard material needs a master" — orichalcum takes an expert or better, adamantine a trained hand. No separate cut-off was needed.

Covered by the tests `rough work stops returning anything at base 40` and `orichalcum takes fine work or none`, and checked by the tables: `node test/balance-tables.mjs 64`.
