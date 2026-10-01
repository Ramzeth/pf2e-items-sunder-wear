# PF2e Items — Sunder & Wear

Item durability for Pathfinder 2e in Foundry VTT. Two halves, as the name says:

**Sunder** — deliberate destruction. Items get HP, Hardness and a material; you can attack them, they break and are destroyed, and broken equipment applies the penalties it should.

**Wear** — wearing out on its own, through use. A homebrew layer on top: weapons grind down on a natural 1, armour under criticals against its wearer, and every field repair permanently lowers the ceiling the item can ever be repaired to. **Off by default.**

A heavily reworked fork of [PF2e Aztec's Sundered](https://github.com/Tebesski/pf2e-aztecs-sundered) by Aztec. The base is theirs; the wear system, the repair chain and everything around the repair limit were added here.

> The two modules cannot be installed together: they write to the same item flags and inject the same buttons.

---

## Installation

The manifest link for the latest release:

```
https://github.com/Ramzeth/pf2e-items-sunder-wear/releases/latest/download/module.json
```

Paste it into the "Manifest URL" field on Foundry's module installation screen.

Requires the **pf2e** system and Foundry **v13+**.

---

## Sunder: durability and destruction

- HP, Hardness and material for weapons, armour, shields and any other gear
- the material ladder from the rules, from paper to iron structure, plus precious materials
- an item damage window: damage types, ignoring Hardness, adamantine, corrosive, razing, persistent damage
- immunities, weaknesses and resistances at the item level
- broken and destroyed conditions with their penalties; for NPCs the GM picks the penalties in a dialog
- a sunder button right in the damage card in chat
- a destroyed backpack spills its contents

## Wear: attrition and fatigue

The full rules are in **[docs/iznos-snaryazheniya.md](docs/iznos-snaryazheniya.md)**. In brief:

| Term | What it is |
|---|---|
| **Base** | the maximum HP the item left the forge with |
| **Repair limit** | the ceiling it can currently be repaired to; falls with every field repair |
| **BT** | broken threshold: 25% of Base for weapons, 50% for armour |

**Three triggers.** A natural 1 on an attack roll — the weapon takes `1d4`. A critical hit against the wearer — the armour takes `1d4`. Any strike with a broken weapon — a flat 1 HP.

Nothing is applied automatically: a button appears on the attack card, visible only to the item's owner and the GM. One click rolls the die, deducts the HP and prints a card.

**Repair is a conversation in chat,** because the roll needs the smith's character and writing HP needs the item's owner, and no one participant holds both ends:

```
the owner publishes a request → any smith rolls their own Crafting → the owner applies it
```

**The repairer chooses how finely to work.** Five grades, from Rough to Flawless, each needing a higher Crafting proficiency and adding to the DC — and each spending less of the item's future for the same hit points back. The window shows the resulting DC and what every outcome would do to the repair limit before anything is rolled. That is the reason to carry a damaged blade to somebody good rather than patch it yourself.

Every successful repair lowers the limit, and the worse the item's condition was, the more it lowers it. Only a town forge restores the limit fully — by the GM's hand, in the durability window.

---

## The sunder macro

The module exposes an API for a hotbar button. Create a Script macro:

```js
const target = canvas.tokens.controlled[0]?.actor
if (!target) return ui.notifications.warn("Select a token first.")
game.modules.get("pf2e-items-sunder-wear").api.launchSunderMacro(target)
```

> **For later:** this macro belongs in a compendium of its own, so users do not have to create it by hand. It is not there because a Foundry compendium is stored only as a binary LevelDB, and keeping an unreadable binary in the repository for four lines of code was not worth it. The right answer is to keep the macro's source as text and build the pack in CI with `@foundryvtt/foundryvtt-cli`.

---

## Settings

Everything to do with wear lives under the master switch **"Enable equipment wear"**, which is off by default. While it is off the module behaves like the base one: the broken threshold is 50% of maximum again, and there are no extra fields or flags on items.

Separately configurable: the wear damage formula, the cost of a strike with a broken weapon, the fatigue divisors and broken-threshold percentages for weapons and armour, full restoration on one check, broken armour penalties, rune suppression when broken, and the visibility of each interface element to players.

The full table is in the [rules document](docs/iznos-snaryazheniya.md), §9.

---

## Development

```bash
node --test "test/*.test.mjs"
```

120 tests. The rules are kept as pure functions with no dependency on Foundry and are checked **against the document** rather than against the code: every table in `docs/iznos-snaryazheniya.md` has its own assert, and a divergence between the rules and the implementation fails a test.

Balance changes have their own instrument:

```bash
node test/balance-tables.mjs 20
```

Three Monte Carlo tables over 100 000 item lifetimes per cell, which is how the repair ladder's `k` values and DC schedule were chosen. It reads the ladder straight out of the code, so it always describes what the module actually does. It is not a unit test and `node --test` does not pick it up.

Parsing PF2e's messages — the paths to the die, to the attack's target, to the worn armour — is not covered by tests; it needs a live world. It is collected in a thin layer inside `src/hooks/` so that a fix after a system update lands in one place.

---

## Licence

**Undetermined, and that is temporary.**

The original module [PF2e Aztec's Sundered](https://github.com/Tebesski/pf2e-aztecs-sundered) is published without a licence file. By default that means "all rights reserved", and since this module is a derivative work, a licence cannot be chosen for it unilaterally: the copyright in the original source is not mine.

What follows from that:

- the fork exists within GitHub's terms, which explicitly permit forking;
- using it at your own table is fine;
- **publishing it in the Foundry module registry is not**, until the question is settled.

It is settled by a single email to the author asking them to add a licence to the original repository; the de facto standard for Foundry modules is MIT. As soon as one exists, there will be a `LICENSE` here with Aztec's copyright on the original work and mine on the changes.

If you are reading this and need the module for something other than "install it myself" — get in touch and we will speed this up.

---

## Credits

[Aztec](https://github.com/Tebesski) — author of the original module all of this is built on.

[AlphaStarguide](https://github.com/AlphaStarguide) — Chinese localisation.
