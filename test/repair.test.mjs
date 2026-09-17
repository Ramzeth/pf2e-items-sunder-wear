/**
 * Repair rules against iznos-snaryazheniya.md §7 "Ремонт".
 *
 * Run with:  node --test test/repair.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"

/* repair.mjs reaches wear.mjs for the repair limit, which reads settings.
 * Full repair is off for most tests so the RAW arithmetic stays visible; the
 * tests that care about it turn it on. */
let fullRepairSetting = false

globalThis.game = {
   settings: {
      get: (module, key) =>
         ({
            enableWearSystem: true,
            enableWeaponWear: true,
            enableArmourWear: true,
            wearWeaponDivisor: 40,
            wearArmourDivisor: 80,
            wearWeaponBtPercent: 25,
            wearArmourBtPercent: 50,
            restrictPreciousMaterial: false,
            wearFullRepair: fullRepairSetting,
         })[key],
   },
}

const {
   getHealingValues,
   getDegreeOfSuccess,
   getHealBudget,
   getLimitLossMultiplier,
   calcRepairHeal,
   calcRepairLimitLoss,
   calcRepairTime,
   resolveLimitLoss,
   applyRepair,
} = await import("../src/repair.mjs")

const makeSword = (flags) => {
   const stored = { ...flags }
   return {
      type: "weapon",
      system: { baseItem: "longsword" },
      updates: [],
      getFlag: (scope, key) => stored[key],
      async update(data) {
         this.updates.push(data)
         for (const [path, value] of Object.entries(data))
            stored[path.replace("flags.world.", "")] = value
      },
   }
}

/* §7: "успех — 10 HP тренированному (+5 за ранг), критуспех — 20 HP
 * (+10 за ранг)." */
test("healing follows proficiency rank", () => {
   assert.deepEqual(getHealingValues(1), { baseHeal: 10, critHeal: 20 })
   assert.deepEqual(getHealingValues(2), { baseHeal: 15, critHeal: 30 })
   assert.deepEqual(getHealingValues(3), { baseHeal: 20, critHeal: 40 })
   assert.deepEqual(getHealingValues(4), { baseHeal: 25, critHeal: 50 })
})

test("an untrained repairer restores less", () => {
   assert.deepEqual(getHealingValues(0), { baseHeal: 5, critHeal: 10 })
})

/* The eyepiece doubles what a success restores, but a critical success with
 * one is one and a half times that rather than double again — so the gap
 * between a success and a critical narrows when you own the tool. These are
 * the module's own figures, carried over unchanged. */
test("a Crafter's Eyepiece raises both figures", () => {
   assert.deepEqual(getHealingValues(0, true), { baseHeal: 10, critHeal: 15 })
   assert.deepEqual(getHealingValues(1, true), { baseHeal: 20, critHeal: 30 })
   assert.deepEqual(getHealingValues(4, true), { baseHeal: 50, critHeal: 75 })
})

/* ------------------------------------------------------------------ */

test("degrees of success follow the ten-point bands", () => {
   assert.equal(getDegreeOfSuccess(28, 18), "criticalSuccess")
   assert.equal(getDegreeOfSuccess(18, 18), "success")
   assert.equal(getDegreeOfSuccess(17, 18), "failure")
   assert.equal(getDegreeOfSuccess(8, 18), "criticalFailure")
})

test("a natural 20 or 1 shifts the result one step", () => {
   assert.equal(
      getDegreeOfSuccess(18, 18, 20),
      "criticalSuccess",
      "a success on a natural 20 becomes critical",
   )
   assert.equal(
      getDegreeOfSuccess(18, 18, 1),
      "failure",
      "a success on a natural 1 drops to a failure",
   )
   assert.equal(
      getDegreeOfSuccess(8, 18, 1),
      "criticalFailure",
      "and a critical failure cannot get worse",
   )
})

/* ------------------------------------------------------------------ *
 * §7: критуспех и успех восстанавливают HP, провал и критпровал — нет.
 * Урон, который критпровал наносит предмету, применяется при починке,
 * а не здесь.
 * ------------------------------------------------------------------ */

test("only the two successes restore anything", () => {
   assert.equal(getHealBudget("criticalSuccess", 1), 20)
   assert.equal(getHealBudget("success", 1), 10)
   assert.equal(getHealBudget("failure", 1), 0)
   assert.equal(getHealBudget("criticalFailure", 1), 0)
})

/* ------------------------------------------------------------------ *
 * Applying a repair
 *
 * §7: "Восстановление ограничено новым Пределом" — repair tops out at the
 * repair limit, never at the base. This is the line that makes fatigue
 * matter at all.
 * ------------------------------------------------------------------ */

test("a repair cannot take an item past its repair limit", () => {
   assert.deepEqual(
      calcRepairHeal({ currentHp: 8, repairLimit: 12, healBudget: 15 }),
      { restored: 4, hpAfter: 12 },
      "eleven of the fifteen HP are wasted effort",
   )
})

test("a repair well inside the limit restores the whole budget", () => {
   assert.deepEqual(
      calcRepairHeal({ currentHp: 4, repairLimit: 20, healBudget: 10 }),
      { restored: 10, hpAfter: 14 },
   )
})

test("a failed repair restores nothing and moves nothing", () => {
   assert.deepEqual(
      calcRepairHeal({ currentHp: 8, repairLimit: 20, healBudget: 0 }),
      { restored: 0, hpAfter: 8 },
   )
})

/* A critical success spends no limit, which makes it the clean way to look at
 * the healing on its own. */
const CLEAN = { outcome: "criticalSuccess" }

test("applying reads the item's own state, not the card's", async () => {
   /* The card promised 15 HP back when the sword was at 8. It has taken
    * another hit since, and the repair has to work from where it is now. */
   const sword = makeSword({ maxHp: 20, currentHp: 3 })
   const result = await applyRepair(sword, { ...CLEAN, healBudget: 15 })

   assert.equal(result.hpBefore, 3)
   assert.equal(result.hpAfter, 18)
   assert.equal(result.restored, 15)
})

test("the same rolled repair cannot be applied twice", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 4 })

   const first = await applyRepair(sword, {
      ...CLEAN,
      healBudget: 10,
      onceKey: "msg-1",
   })
   assert.equal(first.hpAfter, 14)

   const second = await applyRepair(sword, {
      ...CLEAN,
      healBudget: 10,
      onceKey: "msg-1",
   })
   assert.equal(second, null)
   assert.equal(sword.getFlag("world", "currentHp"), 14)
})

test("repair stops at the eroded limit, not at the base", async () => {
   const sword = makeSword({ maxHp: 20, repairLimit: 12, currentHp: 4 })
   const result = await applyRepair(sword, { ...CLEAN, healBudget: 25 })

   assert.equal(result.hpAfter, 12, "the base of 20 is out of reach")
   assert.equal(result.limitAfter, 12)
})

/* ------------------------------------------------------------------ *
 * "One check repairs in full" — a deliberate departure from RAW, and the
 * default for this homebrew. The balance lives in the repair limit, not in
 * how many times the same check gets re-rolled at camp.
 * ------------------------------------------------------------------ */

test("a successful repair goes all the way to the limit", () => {
   assert.deepEqual(
      calcRepairHeal({
         currentHp: 2,
         repairLimit: 17,
         healBudget: 10,
         fullRepair: true,
      }),
      { restored: 15, hpAfter: 17 },
      "the budget of 10 no longer caps anything",
   )
})

test("full repair still stops at the limit, never the base", () => {
   assert.equal(
      calcRepairHeal({
         currentHp: 2,
         repairLimit: 12,
         healBudget: 25,
         fullRepair: true,
      }).hpAfter,
      12,
   )
})

test("full repair does nothing for a failed check", () => {
   assert.deepEqual(
      calcRepairHeal({
         currentHp: 5,
         repairLimit: 20,
         healBudget: 0,
         fullRepair: true,
      }),
      { restored: 0, hpAfter: 5 },
      "a failure restores nothing either way",
   )
})

/* ------------------------------------------------------------------ *
 * Time spent
 *
 * Repair is a ten-minute exploration activity. Collapsing the re-rolls into
 * one check does not make the work instant, so the time is reconstructed
 * from how many by-the-book attempts the result would have taken.
 * ------------------------------------------------------------------ */

test("a repair within one attempt's budget costs ten minutes", () => {
   assert.deepEqual(calcRepairTime({ restored: 10, healPerAttempt: 10 }), {
      rawAttempts: 1,
      minutes: 10,
   })
   assert.deepEqual(calcRepairTime({ restored: 4, healPerAttempt: 10 }), {
      rawAttempts: 1,
      minutes: 10,
   })
})

test("a full repair costs the time it would have stood for", () => {
   assert.deepEqual(calcRepairTime({ restored: 15, healPerAttempt: 10 }), {
      rawAttempts: 2,
      minutes: 20,
   })
   assert.deepEqual(calcRepairTime({ restored: 35, healPerAttempt: 10 }), {
      rawAttempts: 4,
      minutes: 40,
   })
})

/* Ten minutes of fruitless work is exactly what a failed repair is. */
test("a failure still costs ten minutes", () => {
   assert.deepEqual(calcRepairTime({ restored: 0, healPerAttempt: 0 }), {
      rawAttempts: 1,
      minutes: 10,
   })
})

test("applying a repair reports the time it took", async () => {
   fullRepairSetting = true
   const plate = makeSword({ maxHp: 40, currentHp: 5 })
   const result = await applyRepair(plate, { ...CLEAN, healBudget: 10 })

   assert.equal(result.restored, 35)
   assert.equal(result.minutes, 40)
   fullRepairSetting = false
})

test("the setting drives what a repair actually does", async () => {
   const budget = 10

   fullRepairSetting = false
   const byTheBook = makeSword({ maxHp: 20, currentHp: 2 })
   assert.equal(
      (await applyRepair(byTheBook, { ...CLEAN, healBudget: budget })).hpAfter,
      12,
   )

   fullRepairSetting = true
   const homebrew = makeSword({ maxHp: 20, currentHp: 2 })
   assert.equal(
      (await applyRepair(homebrew, { ...CLEAN, healBudget: budget })).hpAfter,
      20,
   )

   fullRepairSetting = false
})

/* ------------------------------------------------------------------ *
 * Fatigue — iznos-snaryazheniya.md §6
 *
 * "Потеря Предела = (Предел − текущие HP) × mod. Целая часть снимается
 *  гарантированно, дробная часть — это шанс снять ещё единицу."
 * ------------------------------------------------------------------ */

test("the loss is the damage carried, times the material's mod", () => {
   assert.equal(
      calcRepairLimitLoss({ repairLimit: 20, currentHp: 5, mod: 0.5 }),
      7.5,
      "a steel sword patched up from 5 spends 7.5 of its future",
   )
   assert.equal(
      calcRepairLimitLoss({ repairLimit: 20, currentHp: 18, mod: 0.5 }),
      1,
      "topping up a scratch is nearly free",
   )
})

/* §7: критуспех не тратит Предел, провал тратит по формуле,
 * критпровал — вдвое. */
test("only a critical success spares the limit", () => {
   assert.equal(getLimitLossMultiplier("criticalSuccess"), 0)
   assert.equal(getLimitLossMultiplier("success"), 1)
   assert.equal(getLimitLossMultiplier("failure"), 1, "a failure still costs")
   assert.equal(
      getLimitLossMultiplier("criticalFailure"),
      1,
      "a critical failure costs the same and adds damage instead",
   )
})

/* "Потеря 7.5 → минус 7, плюс 50% на восьмую." */
test("the fraction of a loss is a chance, not a rounding", () => {
   assert.equal(resolveLimitLoss(7.5, 50), 8, "a roll of 50 takes the eighth")
   assert.equal(resolveLimitLoss(7.5, 51), 7, "a roll of 51 does not")
   assert.equal(resolveLimitLoss(7.5, 1), 8)
   assert.equal(resolveLimitLoss(7.5, 100), 7)
})

test("a whole loss needs no roll at all", () => {
   assert.equal(resolveLimitLoss(3, 1), 3)
   assert.equal(resolveLimitLoss(3, 100), 3)
})

/* ------------------------------------------------------------------ *
 * The order: the limit is spent first, and the healing then works against
 * what is left. Healing first would hand back hit points the item was never
 * entitled to.
 * ------------------------------------------------------------------ */

test("the limit falls before the healing, and the healing respects it", async () => {
   fullRepairSetting = true
   const sword = makeSword({ maxHp: 20, currentHp: 4 })

   // (20 − 4) × 0.5 = 8 exactly, so no fraction to roll.
   const result = await applyRepair(sword, {
      outcome: "success",
      healBudget: 10,
      percentRoll: 100,
   })

   assert.equal(result.limitBefore, 20)
   assert.equal(result.limitAfter, 12)
   assert.equal(result.limitLost, 8)
   assert.equal(
      result.hpAfter,
      12,
      "healed to the NEW limit of 12, not the old 20",
   )
   fullRepairSetting = false
})

/* The question this system exists to answer: with full repair on, a success
 * restores everything up to the new limit whatever the card's budget said. */
test("full repair fills to the new limit regardless of the budget", async () => {
   fullRepairSetting = true

   for (const budget of [5, 10, 25, 50]) {
      const sword = makeSword({ maxHp: 20, currentHp: 4 })
      const result = await applyRepair(sword, {
         outcome: "success",
         healBudget: budget,
         percentRoll: 100,
      })

      assert.equal(
         result.hpAfter,
         12,
         `budget ${budget} should still fill to the new limit`,
      )
      assert.equal(result.restored, 8)
   }

   fullRepairSetting = false
})

/* A critical failure is a failure plus a wear die. It used to cost the limit
 * double, which at a limit of 12 took a battered blade straight to its broken
 * threshold on one roll — too sharp, and unrecoverable. Damage can at least
 * be repaired again. */
test("a critical failure costs the limit once and damages the item", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 8 })

   // limit: (20 − 8) × 0.5 = 6 exactly, so 20 → 14. Then 4 damage.
   const result = await applyRepair(sword, {
      outcome: "criticalFailure",
      healBudget: 0,
      critFailRoll: 4,
      percentRoll: 100,
   })

   assert.equal(result.limitAfter, 14, "the same loss a plain failure costs")
   assert.equal(result.critDamage, 4)
   assert.equal(result.hpAfter, 4, "8 − 4")
   assert.equal(result.restored, 0)
})

test("a rune blunts the damage from a botched repair", async () => {
   const runed = makeSword({
      maxHp: 20,
      currentHp: 8,
      runesBackup: { potency: 2 },
   })

   const result = await applyRepair(runed, {
      outcome: "criticalFailure",
      healBudget: 0,
      critFailRoll: 3,
      percentRoll: 100,
   })

   assert.equal(result.critDamage, 1, "3 − 2 from the potency rune")
})

/* Material Hardness is ignored here as it is everywhere in this system: a d4
 * against steel's Hardness 9 would never do anything at all. */
test("material hardness does not stop a botched repair", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 8, hardness: 9 })

   const result = await applyRepair(sword, {
      outcome: "criticalFailure",
      healBudget: 0,
      critFailRoll: 4,
      percentRoll: 100,
   })

   assert.equal(result.critDamage, 4)
})

test("the limit never erodes below the broken threshold", async () => {
   const sword = makeSword({ maxHp: 20, repairLimit: 6, currentHp: 1 })

   const result = await applyRepair(sword, {
      outcome: "failure",
      healBudget: 0,
      percentRoll: 100,
   })

   assert.equal(result.limitAfter, 5, "the threshold of 5 is the floor")
})

test("a critical success leaves the limit untouched", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 4 })
   const result = await applyRepair(sword, {
      outcome: "criticalSuccess",
      healBudget: 10,
      percentRoll: 1,
   })

   assert.equal(result.limitLost, 0)
   assert.equal(result.limitAfter, 20)
})
