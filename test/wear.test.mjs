/**
 * Checks the Wear & Tear logic against docs/iznos-snaryazheniya.md.
 *
 * Every table in that document which the code is supposed to reproduce gets
 * an assertion here, written from the document rather than from the code, so
 * that a drift between the two shows up as a failure rather than as a
 * surprise at the table.
 *
 * Run with:  node --test test/
 */

import test from "node:test"
import assert from "node:assert/strict"

/* ------------------------------------------------------------------ *
 * Foundry stubs. wear.mjs only needs game.settings; logic.mjs needs
 * item.getFlag and item.system.
 * ------------------------------------------------------------------ */

/* No Roll stub is needed: the rules layer never rolls. Dice are thrown in the
 * chat-card layer and the result is handed in, which is what makes all of
 * this testable without Foundry. */

const settings = new Map([
   ["enableWearSystem", true],
   ["wearDamageFormula", "1d4"],
   ["wearBrokenStrikeCost", 1],
   ["enableWeaponWear", true],
   ["enableArmourWear", true],
   ["wearWeaponDivisor", 40],
   ["wearArmourDivisor", 80],
   ["wearWeaponBtPercent", 25],
   ["wearArmourBtPercent", 50],
   ["restrictPreciousMaterial", false],
])

globalThis.game = { settings: { get: (module, key) => settings.get(key) } }

const withSetting = (key, value, body) => {
   const previous = settings.get(key)
   settings.set(key, value)
   try {
      return body()
   } finally {
      settings.set(key, previous)
   }
}

/** A stand-in for a Foundry item document, with only what the code touches. */
const makeItem = ({ type = "weapon", baseItem, acBonus, flags = {} } = {}) => {
   const stored = { ...flags }
   return {
      type,
      system: { baseItem, acBonus },
      updates: [],
      getFlag: (scope, key) => stored[key],
      async update(data) {
         this.updates.push(data)
         for (const [path, value] of Object.entries(data)) {
            const key = path.replace("flags.world.", "")
            if (key.startsWith("-=")) delete stored[key.slice(2)]
            else stored[key] = value
         }
      },
   }
}

const weapon = (baseItem, flags) => makeItem({ type: "weapon", baseItem, flags })
const armour = (baseItem, flags) =>
   makeItem({ type: "armor", baseItem, acBonus: 1, flags })

const closeTo = (actual, expected, label) =>
   assert.ok(
      Math.abs(actual - expected) < 1e-9,
      `${label}: expected ${expected}, got ${actual}`,
   )

const {
   getWearBase,
   getWearProfile,
   getRuneHardness,
   getBrokenThreshold,
   getRepairLimit,
   setRepairLimit,
   calcWearDamage,
   applyWearHit,
} = await import("../src/wear.mjs")

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §4 "Материалы", таблица оружия
 *
 * | База | ПП | mod  | оружие                                        |
 * |    8 |  2 | 0.20 | кнут, скорпионий кнут, бола, сап, кистень      |
 * |   12 |  3 | 0.30 | лук, длинный лук, арбалет, праща, дубина, копьё |
 * |   16 |  4 | 0.40 | тяжёлый арбалет, вакидзаси                     |
 * |   20 |  5 | 0.50 | всё металлическое, посох, длинное копьё        |
 * ------------------------------------------------------------------ */

const weaponLadder = [
   { base: 8, bt: 2, mod: 0.2, items: ["whip", "scorpion-whip", "bola", "sap"] },
   {
      base: 12,
      bt: 3,
      mod: 0.3,
      items: ["longbow", "crossbow", "sling", "club", "spear", "javelin"],
   },
   { base: 16, bt: 4, mod: 0.4, items: ["heavy-crossbow", "wakizashi"] },
   {
      base: 20,
      bt: 5,
      mod: 0.5,
      items: ["longsword", "dagger", "greataxe", "staff", "longspear"],
   },
]

for (const row of weaponLadder) {
   test(`weapon ladder: base ${row.base} → ПП ${row.bt}, mod ${row.mod}`, () => {
      for (const baseItem of row.items) {
         const profile = getWearProfile(weapon(baseItem))
         assert.ok(profile, `${baseItem} should be inside the wear system`)
         assert.equal(profile.base, row.base, `${baseItem} base`)
         assert.equal(profile.bt, row.bt, `${baseItem} broken threshold`)
         closeTo(profile.mod, row.mod, `${baseItem} mod`)
      }
   })
}

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §4 "Материалы", таблица брони
 *
 * | База | ПП | mod  | броня                                        |
 * |   12 |  6 | 0.15 | стёганая, ги, одежда                          |
 * |   16 |  8 | 0.20 | кожаная, клёпаная, hide                       |
 * |   20 | 10 | 0.25 | кольчужная рубаха, деревянная кираса          |
 * |   28 | 14 | 0.35 | кольчуга, керамическая, коралловая            |
 * |   36 | 18 | 0.45 | кираса, чешуйчатая, О-ёрой                    |
 * |   40 | 20 | 0.50 | латы, полулаты, шинная, хеллнайтские          |
 * ------------------------------------------------------------------ */

const armourLadder = [
   { base: 12, bt: 6, mod: 0.15, items: ["padded-armor", "quilted-armor", "gi"] },
   {
      base: 16,
      bt: 8,
      mod: 0.2,
      items: ["leather-armor", "studded-leather-armor", "hide-armor"],
   },
   {
      base: 20,
      bt: 10,
      mod: 0.25,
      items: ["chain-shirt", "wooden-breastplate"],
   },
   {
      base: 28,
      bt: 14,
      mod: 0.35,
      items: ["chain-mail", "ceramic-plate", "coral-armor"],
   },
   {
      base: 36,
      bt: 18,
      mod: 0.45,
      items: ["breastplate", "scale-mail", "o-yoroi"],
   },
   {
      base: 40,
      bt: 20,
      mod: 0.5,
      items: ["full-plate", "half-plate", "splint-mail", "hellknight-plate"],
   },
]

for (const row of armourLadder) {
   test(`armour ladder: base ${row.base} → ПП ${row.bt}, mod ${row.mod}`, () => {
      for (const baseItem of row.items) {
         const profile = getWearProfile(armour(baseItem))
         assert.ok(profile, `${baseItem} should be inside the wear system`)
         assert.equal(profile.base, row.base, `${baseItem} base`)
         assert.equal(profile.bt, row.bt, `${baseItem} broken threshold`)
         closeTo(profile.mod, row.mod, `${baseItem} mod`)
      }
   })
}

/* iznos-snaryazheniya.md §4: "Максимальный mod в обеих системах ровно 0.50 —
 * у металлического оружия (база 20 при делителе 40) и у лат (база 40 при
 * делителе 80)." */
test("mod tops out at exactly 0.50 in both systems", () => {
   closeTo(getWearProfile(weapon("longsword")).mod, 0.5, "metal weapon")
   closeTo(getWearProfile(armour("full-plate")).mod, 0.5, "full plate")

   for (const row of [...weaponLadder, ...armourLadder])
      assert.ok(row.mod <= 0.5, `ladder row ${row.base} exceeds the 0.50 cap`)
})

/* iznos-snaryazheniya.md §1: "ПП — 25% Базы у оружия, 50% у брони." */
test("broken threshold is 25% of base for weapons, 50% for armour", () => {
   assert.equal(getWearProfile(weapon("longsword")).btPercent, 25)
   assert.equal(getWearProfile(armour("full-plate")).btPercent, 50)
})

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §5 "Руны: Твёрдость"
 *
 * | руна | Твёрдость |
 * | нет  | 0 |
 * | +1   | 1 |
 * | +2   | 2 |
 * | +3   | 3 |
 * ------------------------------------------------------------------ */

test("rune hardness equals the potency rank", () => {
   const withPotency = (potency) => ({
      type: "weapon",
      system: { runes: { potency } },
      getFlag: () => undefined,
   })

   assert.equal(getRuneHardness(withPotency(0)), 0)
   assert.equal(getRuneHardness(withPotency(1)), 1)
   assert.equal(getRuneHardness(withPotency(2)), 2)
   assert.equal(getRuneHardness(withPotency(3)), 3)
   assert.equal(
      getRuneHardness({ type: "weapon", system: {}, getFlag: () => undefined }),
      0,
      "an item with no runes at all",
   )
})

/* The module strips runes from a broken item into a backup flag. Armour is
 * worn and keeps taking crits while broken, so its rune must keep blunting
 * wear — otherwise a broken +2 suit erodes three times faster than the rules
 * intend. */
test("rune hardness survives the module's broken-item rune suppression", () => {
   /* item-hooks.mjs parks the original runes in flags.world.runesBackup the
    * moment an item breaks, and only then zeroes system.runes according to
    * the suppression settings. Reading the backup first is what keeps a
    * broken +2 from eroding three times faster than an intact one. */
   const suppressed = (type) => ({
      type,
      system: { runes: { potency: 0, striking: 0, property: [] } },
      getFlag: (scope, key) =>
         key === "runesBackup" ? { potency: 2 } : undefined,
   })

   assert.equal(getRuneHardness(suppressed("armor")), 2, "broken armour")
   assert.equal(getRuneHardness(suppressed("weapon")), 2, "broken weapon")
})

/* ------------------------------------------------------------------ *
 * The threshold is measured against the base and never against the
 * eroding repair limit. iznos-snaryazheniya.md §1 calls it "Фиксирован".
 * ------------------------------------------------------------------ */

test("broken threshold stays put while the repair limit erodes", () => {
   const sword = weapon("longsword", { maxHp: 20 })
   assert.equal(getBrokenThreshold(sword), 5)

   const tired = weapon("longsword", { maxHp: 20, repairLimit: 12 })
   assert.equal(
      getBrokenThreshold(tired),
      5,
      "a tired sword breaks at the same 5 HP it always did",
   )

   const spent = weapon("longsword", { maxHp: 20, repairLimit: 6 })
   assert.equal(getBrokenThreshold(spent), 5)
})

test("a GM-set base drives the threshold, not the material table", () => {
   const unique = weapon("longsword", { maxHp: 30 })
   assert.equal(getWearBase(unique), 30)
   assert.equal(getBrokenThreshold(unique), 7, "25% of 30, rounded down")
})

/* ------------------------------------------------------------------ *
 * Items the system does not govern
 * ------------------------------------------------------------------ */

test("with the system off, everything falls back to half of max HP", () => {
   withSetting("enableWearSystem", false, () => {
      const sword = weapon("longsword", { maxHp: 20 })
      assert.equal(getWearProfile(sword), null)
      assert.equal(getBrokenThreshold(sword), 10, "vanilla 50% of max")
      assert.equal(
         getRepairLimit(sword),
         20,
         "no separate limit exists outside the system",
      )
   })
})

test("weapon and armour wear can be switched off independently", () => {
   withSetting("enableWeaponWear", false, () => {
      assert.equal(getWearProfile(weapon("longsword")), null)
      assert.ok(getWearProfile(armour("full-plate")))
   })
   withSetting("enableArmourWear", false, () => {
      assert.ok(getWearProfile(weapon("longsword")))
      assert.equal(getWearProfile(armour("full-plate")), null)
   })
})

/* iznos-snaryazheniya.md §2: "Роба мага и explorer's clothing — вне системы.
 * Нулевой бонус AC, существуют ради рун." */
test("armour with no AC bonus is outside the system", () => {
   const robe = makeItem({
      type: "armor",
      baseItem: "explorers-clothing",
      acBonus: 0,
   })
   assert.equal(getWearProfile(robe), null)
})

/* iznos-snaryazheniya.md §2: shields already have Shield Block attrition in RAW. */
test("shields are outside the system and keep their own threshold", () => {
   const shield = {
      type: "shield",
      system: { hp: { max: 20, brokenThreshold: 8 }, hardness: 5 },
      getFlag: () => undefined,
   }
   assert.equal(getWearProfile(shield), null)
   assert.equal(getBrokenThreshold(shield), 8, "PF2e's own threshold, not 10")
   assert.equal(getRepairLimit(shield), 20)
})

/* ------------------------------------------------------------------ *
 * The repair limit itself
 * ------------------------------------------------------------------ */

test("a fresh item sits at its base with no flag of its own", () => {
   const sword = weapon("longsword")
   assert.equal(getRepairLimit(sword), 20)
   assert.equal(sword.getFlag("world", "repairLimit"), undefined)
})

/* iznos-snaryazheniya.md §6: "Предел не опускается ниже ПП." */
test("the repair limit never erodes below the broken threshold", async () => {
   const sword = weapon("longsword", { maxHp: 20 })
   await setRepairLimit(sword, 1)
   assert.equal(getRepairLimit(sword), 5, "clamped up to the threshold of 5")
})

test("the repair limit never rises above the base", async () => {
   const sword = weapon("longsword", { maxHp: 20, repairLimit: 12 })
   await setRepairLimit(sword, 99)
   assert.equal(getRepairLimit(sword), 20)
   assert.deepEqual(
      sword.updates.at(-1),
      { "flags.world.-=repairLimit": null },
      "reaching the base clears the flag instead of storing a duplicate",
   )
})

/* iznos-snaryazheniya.md §6: the fractional part of a loss is resolved by a roll
 * before it ever reaches storage, so the stored limit is a whole number. The
 * cycle tables showing 12.5 / 8.75 are expected values, not table numbers. */
test("the stored repair limit is always a whole number", async () => {
   const sword = weapon("longsword", { maxHp: 20 })
   await setRepairLimit(sword, 12.5)
   assert.equal(getRepairLimit(sword), 12)
})

test("writing the same limit twice does not touch the item", async () => {
   const sword = weapon("longsword", { maxHp: 20, repairLimit: 12 })
   await setRepairLimit(sword, 12)
   assert.equal(sword.updates.length, 0)
})

test("the repair limit cannot be set on an item outside the system", async () => {
   await withSetting("enableWearSystem", false, async () => {
      const sword = weapon("longsword", { maxHp: 20 })
      await setRepairLimit(sword, 10)
      assert.equal(sword.updates.length, 0)
   })
})

/* ------------------------------------------------------------------ *
 * Wear damage — iznos-snaryazheniya.md §2
 * ------------------------------------------------------------------ */

test("rune hardness is subtracted from the roll and never goes negative", () => {
   assert.deepEqual(
      calcWearDamage({ currentHp: 20, rolled: 4, runeHardness: 0 }),
      { applied: 4, hpAfter: 16 },
   )
   assert.deepEqual(
      calcWearDamage({ currentHp: 20, rolled: 4, runeHardness: 1 }),
      { applied: 3, hpAfter: 17 },
   )
   assert.deepEqual(
      calcWearDamage({ currentHp: 20, rolled: 1, runeHardness: 3 }),
      { applied: 0, hpAfter: 20 },
      "a +3 shrugs off a roll of 1 entirely",
   )
})

/* There is deliberately NO clamp at the broken threshold here, although both
 * rules documents still describe one. A low enough item is destroyed outright
 * by a single trigger; the material assigned to it is the dial for that. */
test("wear damage lands in full and is not clamped at the threshold", () => {
   assert.deepEqual(
      calcWearDamage({ currentHp: 7, rolled: 4 }),
      { applied: 4, hpAfter: 3 },
      "a whole padded suit drops straight past its threshold of 6",
   )
   assert.deepEqual(
      calcWearDamage({ currentHp: 3, rolled: 4 }),
      { applied: 4, hpAfter: 0 },
      "and can be destroyed by one trigger",
   )
})

test("current HP never goes below zero", () => {
   assert.equal(calcWearDamage({ currentHp: 1, rolled: 4 }).hpAfter, 0)
})

test("applyWearHit writes the new HP and reports the transition", async () => {
   const plate = armour("full-plate", { maxHp: 40, currentHp: 22 })
   const result = await applyWearHit(plate, { rolled: 4 })

   assert.equal(result.applied, 4)
   assert.equal(result.hpAfter, 18)
   assert.equal(result.becameBroken, true, "22 → 18 crosses the threshold of 20")
   assert.equal(result.becameDestroyed, false)
   assert.deepEqual(plate.updates.at(-1), { "flags.world.currentHp": 18 })
})

/* The owner and the GM can both be holding the same button. Foundry has no
 * compare-and-swap, so the key is written in the same update as the hit: a
 * second click that arrives after the first has landed does nothing. */
test("the same fumble cannot be applied twice", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 20 })

   const first = await applyWearHit(sword, { rolled: 4, onceKey: "msg-abc" })
   assert.equal(first.hpAfter, 16)
   assert.equal(sword.getFlag("world", "lastWearKey"), "msg-abc")

   const second = await applyWearHit(sword, { rolled: 4, onceKey: "msg-abc" })
   assert.equal(second, null, "the second click is refused")
   assert.equal(sword.getFlag("world", "currentHp"), 16, "HP untouched")
})

test("a different fumble on the same weapon still applies", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 20 })

   await applyWearHit(sword, { rolled: 4, onceKey: "msg-abc" })
   const next = await applyWearHit(sword, { rolled: 3, onceKey: "msg-def" })

   assert.equal(next.hpAfter, 13)
})

/* Being broken is no protection: a fumble with a ruined blade is charged
 * twice, once for the swing and once for the fumble. */
test("a broken weapon still takes the d4 on top of the strike cost", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 5 })

   const strike = await applyWearHit(sword, { flat: 1 })
   assert.equal(strike.hpAfter, 4, "the swing itself")

   const fumble = await applyWearHit(sword, { rolled: 4 })
   assert.equal(fumble.applied, 4)
   assert.equal(fumble.hpAfter, 0, "and the fumble finishes it off")
   assert.equal(fumble.becameDestroyed, true)
})

test("broken armour keeps taking the d4 all the way to zero", async () => {
   const padded = armour("padded-armor", { maxHp: 12, currentHp: 3 })
   const result = await applyWearHit(padded, { rolled: 4 })

   assert.equal(result.hpAfter, 0)
   assert.equal(result.becameDestroyed, true)
})

test("a destroyed item is left alone", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 0 })
   assert.equal(await applyWearHit(sword, { rolled: 4 }), null)
})

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §3 "Удары сломанным оружием"
 *
 * "Каждый удар — 1 урона оружию. Стальной клинок на ПП 5 даёт ровно
 *  5 ударов до уничтожения."
 * ------------------------------------------------------------------ */

test("a broken steel blade gives as many clean strikes as its threshold", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 5 })
   assert.equal(getBrokenThreshold(sword), 5)

   let strikes = 0
   for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await applyWearHit(sword, { flat: 1 })
      if (!result) break
      strikes += 1
      assert.equal(result.applied, 1, "flat 1 HP, no die, no rune hardness")
      if (result.becameDestroyed) break
   }

   assert.equal(strikes, 5)
   assert.equal(sword.getFlag("world", "currentHp"), 0)
})

test("rune hardness does not soften the per-strike cost", async () => {
   const runed = makeItem({
      type: "weapon",
      baseItem: "longsword",
      flags: { maxHp: 20, currentHp: 5, runesBackup: { potency: 3 } },
   })
   const result = await applyWearHit(runed, { flat: 1 })
   assert.equal(result.applied, 1)
})

/* A broken weapon that also comes up a natural 1 owes on both counts, and
 * both are settled by one call so that a single idempotency key can guard
 * them. The rune blunts only the die. */
test("the swing cost and the fumble die are charged together", async () => {
   const runed = makeItem({
      type: "weapon",
      baseItem: "longsword",
      flags: { maxHp: 20, currentHp: 5, runesBackup: { potency: 1 } },
   })

   const result = await applyWearHit(runed, { flat: 1, rolled: 4 })

   assert.equal(result.applied, 4, "1 for the swing, plus 4 − 1 for the die")
   assert.equal(result.hpAfter, 1)
   assert.equal(runed.updates.length, 1, "settled in a single write")
})

test("one key guards both halves of the same attack", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 5 })

   await applyWearHit(sword, { flat: 1, rolled: 2, onceKey: "msg-abc" })
   assert.equal(sword.getFlag("world", "currentHp"), 2)

   const second = await applyWearHit(sword, {
      flat: 1,
      rolled: 2,
      onceKey: "msg-abc",
   })
   assert.equal(second, null, "no second bite at either half")
   assert.equal(sword.getFlag("world", "currentHp"), 2)
})

test("nothing owed means nothing applied", async () => {
   const sword = weapon("longsword", { maxHp: 20, currentHp: 20 })
   const result = await applyWearHit(sword, { flat: 0, rolled: 0 })

   assert.equal(result.applied, 0)
   assert.equal(sword.getFlag("world", "currentHp"), 20)
})

/* ------------------------------------------------------------------ *
 * The settings are the tuning knobs the rules document calls for:
 * "Ручки настройки: ... делитель mod 40 → 60, ПП 25% → 50%."
 * ------------------------------------------------------------------ */

test("tuning the divisor and the threshold percentage moves the numbers", () => {
   withSetting("wearWeaponDivisor", 60, () => {
      closeTo(getWearProfile(weapon("longsword")).mod, 20 / 60, "mod at 60")
   })
   withSetting("wearWeaponBtPercent", 50, () => {
      assert.equal(getWearProfile(weapon("longsword")).bt, 10)
   })
})

test("a divisor of zero means wear damage without fatigue", () => {
   withSetting("wearWeaponDivisor", 0, () => {
      assert.equal(getWearProfile(weapon("longsword")).mod, 0)
   })
})
