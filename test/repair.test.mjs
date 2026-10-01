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
   calcRepairHeal,
   calcRepairLimitLoss,
   calcRepairTime,
   resolveLimitLoss,
   applyRepair,
   previewRepair,
   getSelectableTiers,
   getTierMod,
   isTierProductive,
   shiftTier,
   REPAIR_TIERS,
   ROUGH_TIER,
   FINEST_TIER,
} = await import("../src/repair.mjs")

const { getWearProfile } = await import("../src/wear.mjs")

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
/* A repair that costs no limit at all, so the healing arithmetic below stays
 * readable. There is exactly one way to get that now: a critical success at
 * Flawless, because only there does the step up land on Absolute and its
 * k of 0. A critical success anywhere lower delivers the grade above and
 * still spends something. */
const CLEAN = { outcome: "criticalSuccess", tierIndex: FINEST_TIER }

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
 * one check does not make the work instant, so the time is reconstructed from
 * the work the result stands for — and it is linear, because rounding up to
 * whole spans charged one restored hit point the same as ten and hid the
 * entire appeal of the crude grades.
 * ------------------------------------------------------------------ */

test("time is proportional to what was restored", () => {
   assert.deepEqual(calcRepairTime({ restored: 10, healPerAttempt: 10 }), {
      minutes: 10,
   })
   assert.deepEqual(calcRepairTime({ restored: 5, healPerAttempt: 10 }), {
      minutes: 5,
   })
   assert.deepEqual(
      calcRepairTime({ restored: 1, healPerAttempt: 10 }),
      { minutes: 1 },
      "one point back is one minute, not a whole span",
   )
})

test("a repair beyond one budget takes proportionally longer", () => {
   assert.deepEqual(calcRepairTime({ restored: 15, healPerAttempt: 10 }), {
      minutes: 15,
   })
   assert.deepEqual(calcRepairTime({ restored: 35, healPerAttempt: 10 }), {
      minutes: 35,
   })
})

/* Ten minutes of fruitless work is exactly what a failed repair is. */
test("work that returns nothing still costs ten minutes", () => {
   assert.deepEqual(calcRepairTime({ restored: 0, healPerAttempt: 0 }), {
      minutes: 10,
   })
   assert.deepEqual(
      calcRepairTime({ restored: 0, healPerAttempt: 10 }),
      { minutes: 10 },
      "a success too crude for the item is still ten minutes at the bench",
   )
})

test("applying a repair reports the time it took", async () => {
   fullRepairSetting = true
   const plate = makeSword({ maxHp: 40, currentHp: 5 })
   const result = await applyRepair(plate, { ...CLEAN, healBudget: 10 })

   assert.equal(result.restored, 35)
   assert.equal(result.minutes, 35)
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

/* ------------------------------------------------------------------ *
 * The ladder — iznos-snaryazheniya.md §7
 *
 * Seven grades, five of them selectable. k is geometric (×1.5 a step) and
 * the DC schedule is +0/+2/+4/+7/+10; both were settled by simulation and a
 * change to either is a change to the balance, not a refactor.
 * ------------------------------------------------------------------ */

test("the ladder is the one the tables were built on", () => {
   assert.deepEqual(
      REPAIR_TIERS.map((tier) => tier.k),
      [1.5, 1.0, 0.66, 0.45, 0.3, 0.2, 0],
   )
   assert.deepEqual(
      REPAIR_TIERS.map((tier) => tier.dc),
      [null, 0, 2, 4, 7, 10, null],
   )
})

test("proficiency decides how finely you may work", () => {
   assert.deepEqual(
      getSelectableTiers(0).map((tier) => tier.key),
      ["rough"],
      "untrained can only bodge",
   )
   assert.deepEqual(
      getSelectableTiers(2).map((tier) => tier.key),
      ["rough", "neat", "fine"],
   )
   assert.deepEqual(
      getSelectableTiers(4).map((tier) => tier.key),
      ["rough", "neat", "fine", "jewellers", "flawless"],
      "legendary can do anything a person may choose to do",
   )
})

test("a selectable grade carries the index everything else speaks in", () => {
   assert.deepEqual(
      getSelectableTiers(4).map((tier) => tier.index),
      [1, 2, 3, 4, 5],
   )
})

/* §7: критуспех — ступень вверх, критпровал — ступень вниз. */
test("a critical result moves the grade one step", () => {
   assert.equal(shiftTier(ROUGH_TIER, "criticalSuccess"), 2)
   assert.equal(shiftTier(ROUGH_TIER, "success"), ROUGH_TIER)
   assert.equal(shiftTier(ROUGH_TIER, "failure"), ROUGH_TIER)
   assert.equal(shiftTier(ROUGH_TIER, "criticalFailure"), 0)
})

test("the shift stops at the ends of the ladder", () => {
   assert.equal(
      shiftTier(FINEST_TIER, "criticalSuccess"),
      6,
      "flawless work rolled well is Absolute — the one free repair",
   )
   assert.equal(shiftTier(6, "criticalSuccess"), 6, "and goes no further")
   assert.equal(shiftTier(0, "criticalFailure"), 0)
})

/* The behaviour change worth stating out loud: a critical success used to
 * cost nothing whatever the grade. It costs nothing only from Flawless now. */
test("a critical success is free only at the top of the ladder", async () => {
   const bodged = makeSword({ maxHp: 20, currentHp: 10 })
   const bodge = await applyRepair(bodged, {
      outcome: "criticalSuccess",
      tierIndex: ROUGH_TIER,
      healBudget: 10,
      percentRoll: 100,
   })
   assert.ok(
      bodge.limitLost > 0,
      "a lucky bodger still spends the item's future",
   )

   const finished = makeSword({ maxHp: 20, currentHp: 10 })
   const finish = await applyRepair(finished, {
      outcome: "criticalSuccess",
      tierIndex: FINEST_TIER,
      healBudget: 10,
      percentRoll: 100,
   })
   assert.equal(finish.limitLost, 0)
})

test("the grade scales what the material already costs", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))

   assert.equal(steel.mod, 0.5)
   assert.equal(getTierMod(steel, ROUGH_TIER), 0.5)
   assert.equal(getTierMod(steel, FINEST_TIER), 0.1)
   assert.equal(getTierMod(steel, 6), 0, "Absolute costs nothing by definition")
})

test("an item outside the wear system has no fatigue to scale", () => {
   assert.equal(getTierMod(null, ROUGH_TIER), 0)
})

/* ------------------------------------------------------------------ *
 * "Дорогой предмет требует мастера"
 *
 * A grade returns nothing once mod × k reaches 1: the new ceiling lands at
 * or below where the item already sits. For weapons that is Base 40 for
 * rough work — adamantine and cold iron at their best — and Base 61 for neat.
 * ------------------------------------------------------------------ */

test("rough work stops returning anything at base 40", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))
   const adamantine = getWearProfile(makeSword({ maxHp: 40 }))

   assert.equal(isTierProductive(steel, ROUGH_TIER), true)
   assert.equal(isTierProductive(adamantine, ROUGH_TIER), false)
   assert.equal(
      isTierProductive(adamantine, 2),
      true,
      "but a trained hand still can",
   )
})

test("orichalcum takes fine work or none", () => {
   const orichalcum = getWearProfile(makeSword({ maxHp: 64 }))

   assert.equal(orichalcum.mod, 1.6)
   assert.deepEqual(
      [1, 2, 3, 4, 5].map((tier) => isTierProductive(orichalcum, tier)),
      [false, false, true, true, true],
   )
})

/* The bug this caught: repairing to the limit without checking the item's own
 * HP filed points off a sword somebody had just spent ten minutes on. */
test("a repair that returns nothing does not take anything either", async () => {
   fullRepairSetting = true
   const orichalcum = makeSword({ maxHp: 64, currentHp: 32 })

   const result = await applyRepair(orichalcum, {
      outcome: "success",
      tierIndex: ROUGH_TIER,
      healBudget: 10,
      percentRoll: 100,
   })

   assert.equal(result.restored, 0)
   assert.equal(result.hpAfter, 32, "the blade is no worse for the attempt")
   assert.ok(result.limitAfter < 32, "though its future is spent")
   fullRepairSetting = false
})

/* ------------------------------------------------------------------ *
 * The forecast the repair window draws
 * ------------------------------------------------------------------ */

test("the preview adds the grade's premium to the check", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))
   const at = (tierIndex) =>
      previewRepair({
         profile: steel,
         repairLimit: 20,
         currentHp: 10,
         baseDc: 15,
         tierIndex,
      }).dc

   assert.deepEqual([1, 2, 3, 4, 5].map(at), [15, 17, 19, 22, 25])
})

test("the preview reports each outcome separately", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))
   const { outcomes } = previewRepair({
      profile: steel,
      repairLimit: 20,
      currentHp: 10,
      baseDc: 15,
      tierIndex: 3,
      baseHeal: 15,
      critHeal: 30,
      fullRepair: true,
   })

   // 10 points of damage carried, mod 0.5, Fine k 0.45 → 2.25
   assert.equal(outcomes.success.limitLoss, 2.25)
   assert.equal(outcomes.failure.limitLoss, 2.25, "a failure costs the same")
   assert.ok(
      outcomes.criticalSuccess.limitLoss < outcomes.success.limitLoss,
      "a critical success delivers the grade above",
   )
   assert.ok(
      outcomes.criticalFailure.limitLoss > outcomes.success.limitLoss,
      "and a critical failure the grade below",
   )
   assert.equal(outcomes.criticalFailure.damage, 1)
   assert.equal(outcomes.failure.restored, 0)
})

test("the preview keeps the fraction rather than rounding it away", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))
   const { outcomes } = previewRepair({
      profile: steel,
      repairLimit: 20,
      currentHp: 5,
      baseDc: 15,
      tierIndex: ROUGH_TIER,
   })

   assert.equal(outcomes.success.limitLoss, 7.5)
   assert.equal(outcomes.success.limitAfter, 12.5)
})

/* The limit may be fractional; hit points never are. Forecasting against the
 * certain part of the limit promises only what the repair can guarantee. */
test("the preview never promises a fraction of a hit point", () => {
   const steel = getWearProfile(makeSword({ maxHp: 20 }))
   const { outcomes } = previewRepair({
      profile: steel,
      repairLimit: 20,
      currentHp: 10,
      baseDc: 15,
      tierIndex: 3,
      baseHeal: 15,
      critHeal: 30,
      fullRepair: true,
   })

   // limit 20 → 17.75 on a success, so the sword is promised 17, not 17.75.
   assert.equal(outcomes.success.limitAfter, 17.75)
   assert.equal(outcomes.success.restored, 7)
   for (const forecast of Object.values(outcomes))
      assert.ok(
         Number.isInteger(forecast.restored),
         `${forecast.key} promised a fractional hit point`,
      )
})

test("the preview flags a grade that cannot return anything", () => {
   const orichalcum = getWearProfile(makeSword({ maxHp: 64 }))
   const at = (tierIndex) =>
      previewRepair({
         profile: orichalcum,
         repairLimit: 64,
         currentHp: 32,
         baseDc: 15,
         tierIndex,
         baseHeal: 10,
         fullRepair: true,
      })

   assert.equal(at(ROUGH_TIER).productive, false)
   assert.equal(at(ROUGH_TIER).outcomes.success.restored, 0)
   assert.equal(at(3).productive, true)
   assert.ok(at(3).outcomes.success.restored > 0)
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

/* A critical failure is a failure one grade worse, plus one point. It used to
 * cost the limit double, which at a limit of 12 took a battered blade straight
 * to its broken threshold on one roll — too sharp, and unrecoverable. The step
 * down is the softer version of the same idea, and the damage can at least be
 * repaired again where a lost limit cannot. */
test("a critical failure drops a grade and costs one point of HP", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 8 })

   /* 12 points of damage carried, mod 0.5. Rough would cost 6; a critical
    * failure delivers Abysmal instead, k 1.5, so 12 × 0.75 = 9 → 20 becomes
    * 11. Then the flat point off the blade. */
   const result = await applyRepair(sword, {
      outcome: "criticalFailure",
      tierIndex: ROUGH_TIER,
      healBudget: 0,
      percentRoll: 100,
   })

   assert.equal(result.deliveredTier, 0, "botched work is Abysmal work")
   assert.equal(result.limitAfter, 11, "half again what a plain failure costs")
   assert.equal(result.critDamage, 1)
   assert.equal(result.hpAfter, 7, "8 − 1")
   assert.equal(result.restored, 0)
})

/* The one place in the system where a rune buys nothing. Subtracting Hardness
 * from a single point would leave zero, and a runed item would be immune to
 * spoiled work — a rule that does nothing is worse than no rule. */
test("a rune does not blunt the damage from a botched repair", async () => {
   const runed = makeSword({
      maxHp: 20,
      currentHp: 8,
      runesBackup: { potency: 2 },
   })

   const result = await applyRepair(runed, {
      outcome: "criticalFailure",
      healBudget: 0,
      percentRoll: 100,
   })

   assert.equal(result.critDamage, 1, "the rune is not consulted here")
})

/* Material Hardness is ignored here as it is everywhere in this system: steel's
 * Hardness 9 against one point would never do anything at all. */
test("material hardness does not stop a botched repair", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 8, hardness: 9 })

   const result = await applyRepair(sword, {
      outcome: "criticalFailure",
      healBudget: 0,
      percentRoll: 100,
   })

   assert.equal(result.critDamage, 1)
})

/* A whip has 8 HP at base, and the flat point was chosen so that light gear
 * survives the bench. It can still die there — but only from the last point,
 * never from a full one as the d4 could. */
test("a botched repair can finish an item that is already on 1 HP", async () => {
   const whip = makeSword({ maxHp: 8, repairLimit: 4, currentHp: 1 })

   const result = await applyRepair(whip, {
      outcome: "criticalFailure",
      healBudget: 0,
      percentRoll: 100,
   })

   assert.equal(result.critDamage, 1)
   assert.equal(result.hpAfter, 0)
   assert.equal(result.destroyed, true)
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

test("flawless work rolled critically leaves the limit untouched", async () => {
   const sword = makeSword({ maxHp: 20, currentHp: 4 })
   const result = await applyRepair(sword, {
      outcome: "criticalSuccess",
      tierIndex: FINEST_TIER,
      healBudget: 10,
      percentRoll: 1,
   })

   assert.equal(result.deliveredTier, 6, "Absolute, and its k of zero")
   assert.equal(result.limitLost, 0)
   assert.equal(result.limitAfter, 20)
})
