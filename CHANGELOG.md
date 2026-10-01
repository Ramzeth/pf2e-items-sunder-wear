# Changelog

All notable changes to this module. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [SemVer](https://semver.org/).

## [0.2.0] — 2026-09-19

### Added

- **A quality ladder for repair.** Seven grades from Abysmal to Absolute; the repairer picks one of the five in between and pays for fineness with a higher DC: Rough +0, Neat +2, Fine +4, Jeweller's +7, Flawless +10. The grade scales the material's `mod` by a factor `k` from 1.5 down to 0, which is to say it decides how much repair limit the job eats. Which grades are available is bounded by Crafting proficiency: untrained can only bodge, legendary can do anything.
- **Grade selection and a forecast in both repair windows.** A grade dropdown, the resulting DC, and a breakdown of all four outcomes: how far the limit falls, where it lands, how many HP come back. Below the table, a bar of the repair limit against the Base, showing both the broken threshold and how much the item has already spent for good.
- **One window instead of an instant roll in chat.** The "Repair this" button on a request card now opens a window with the character and grade selection and the same forecast; previously, with a single candidate, the roll went off immediately. The grade travels to the result card so that the owner applies exactly what was rolled. The forecast is computed from the card's snapshot — a smith has no right to read gear they do not own — so the request card now also carries `mod` and the broken threshold.
- **The rule "an expensive item needs a master".** A grade returns anything only while `mod × k < 1`. Rough work stops working at Base 40 (adamantine standard, and cold iron, noqual and siccatite at high grade); orichalcum needs an expert or better. The grade is not blocked: the forecast says plainly that it will restore 0 HP and warns on a line of its own.
- `test/balance-tables.mjs` — a generator for the three Monte Carlo validation tables that `k` and the DC schedule were chosen with. It reads the ladder straight out of the code, so it describes exactly what the module does. Not a unit test; `node --test` does not pick it up.

### Changed

- **A critical success is no longer free in itself.** It used to leave the repair limit alone at any grade of work. It now delivers one grade finer than attempted, which comes out free only from Flawless, where the step up lands on Absolute with its `k` of 0. A lucky bodger gets neat work, not a miracle.
- **A critical failure now delivers one grade worse** instead of costing the same limit as a plain failure, and still takes exactly 1 HP past material Hardness and past rune Hardness.
- **Repair time is linear:** `(restored / budget) × 10` minutes, instead of rounding up to whole ten-minute spans. Rounding charged a smith who got one hit point back the same as one who got ten, and hid exactly what the crude grades are good for. A failure and an empty success still cost ten minutes.
- **Self-repair runs through the same code as repairing for somebody else.** The "Roll Crafting" button in the owner's window was a system of its own: it healed a fixed number of HP, never touched the repair limit at all, and rolled `2d6` against Hardness on a critical failure. An item mended by its own owner aged differently from the same item mended through a chat request.
- The result card names the grade of work and the final DC — the request card advertises the rough-work DC, and without this line the roll would look like a check against somebody else's number.
- The applied card names the grade, and when a critical result shifted it, both: the one attempted and the one delivered.

### Fixed

- **A successful repair could take HP away from the item.** When `mod × k > 1` the new limit lands below the item's current health, and "repair up to the limit" filed points off a sword somebody had just spent ten minutes on. A repair that returns nothing now takes nothing either.
- **Repairing a shield wrote to the wrong place.** Shields keep their HP in `system.hp.value`, while the shared code wrote to module flags nobody reads. Repairing a shield through a chat request did not work at all.

### Removed

- `getLimitLossMultiplier` — the outcome now moves the grade, and the multiplier expressed the same idea a second time.
- `rawAttempts` from the result of `calcRepairTime` — with linear time it meant nothing.

## [0.1.0] — 2026-09-18

The first release of the fork. "PF2e Aztec's Sundered" substantially reworked: an equipment wear system added — Base, repair limit and broken threshold, fatigue from field repair, the natural 1 and critical hit triggers, and field repair as a chain of chat cards.
