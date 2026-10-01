/**
 * Repair rules, as pure functions.
 *
 * These were methods on the repair dialog, where only the item's own owner
 * could reach them. Field repair in this homebrew is a conversation between
 * two people — one rolls, another applies — so the numbers have to be
 * available to both, and neither should have to open a window to get at them.
 *
 * Laid out like wear.mjs: the arithmetic is pure and testable, and only the
 * one function that writes to an item knows Foundry exists.
 */

import { clampRepairLimit, getRepairLimit, getWearProfile } from "./wear.mjs"

/**
 * What a botched repair costs the item in hit points, flat, on top of the
 * limit a plain failure already costs.
 *
 * One point, not a die, and it passes **everything** — material Hardness and
 * the potency rune both. That is deliberate and it is the one place in the
 * system where a rune buys nothing.
 *
 * The die came first and was wrong. `1d4` does not scale with the item: on a
 * whip or a sap sitting at 4 HP it is the whole thing, and because a natural 1
 * is always a critical failure no amount of skill removes it. Simulated over
 * 100 000 item lifetimes, a legendary smith working at zero deficit still
 * destroyed 20% of light weapons on the bench — more than a careless one
 * destroyed heavy ones. A flat point costs the same everywhere: the same run
 * gives 0.0–0.1%, and the penalty still bites when someone hammers away at
 * work beyond them, because it is the repeated attempts that bleed the item
 * out, not any single roll.
 *
 * The rune is skipped for the same reason the die went. Subtracting Hardness 2
 * from one point leaves zero, so a runed item would simply be immune to
 * spoiled work — a rule that does nothing is worse than no rule. Reading it as
 * fiction: a rune protects against blows, and this is not a blow. It is the
 * smith's own file slipping.
 */
export const REPAIR_CRIT_FAILURE_DAMAGE = 1

/**
 * The seven grades of field repair, coarsest first.
 *
 * A repairer picks how finely they work, and pays for fineness with a harder
 * check. `k` scales what the job costs the repair limit, so the fine grades
 * spend less of an item's future for the same hit points back — which is the
 * whole reason to carry a damaged blade to somebody good instead of patching
 * it yourself.
 *
 * `k` is geometric, ×1.5 between neighbours, and that is not decoration. What
 * decides whether a grade is ever worth buying is the **ratio** to the one
 * above it, not the difference: an evenly spaced 1.0 / 0.8 / 0.6 / 0.4 / 0.2
 * gets cheaper and cheaper per step (×1.25, ×1.33, ×1.5, ×2.0) while each step
 * costs the same DC, so the top grade becomes the only sane purchase and the
 * middle of the ladder dies. Simulated over 100 000 item lifetimes per cell,
 * the even ladder left Jeweller's optimal on exactly zero deficits.
 *
 * The DC schedule +0/+2/+4/+7/+10 was found the same way. A grade stays alive
 * on the strength of the gap to the **next one up**, not the gap below it:
 * making Fine dearer to enter (+5) killed it outright, making the step out of
 * it dearer (+7 for Jeweller's) is what gives it the widest band on the
 * ladder. Every grade is optimal on at least three deficits for both a base-20
 * weapon and a base-8 one, and the reference point — a repairer facing a DC
 * ten over their modifier — lands on Fine, as intended.
 *
 * The two ends cannot be chosen. Abysmal is where a critical failure drops
 * you, Absolute is where a critical success lifts you, and `k = 0` there means
 * a flawless smith who rolls a critical success repairs for free.
 *
 * `minRank` is the Crafting proficiency each grade needs: untrained can only
 * ever bodge, legendary can do anything.
 */
export const REPAIR_TIERS = [
   { key: "abysmal", k: 1.5, dc: null, minRank: null },
   { key: "rough", k: 1.0, dc: 0, minRank: 0 },
   { key: "neat", k: 0.66, dc: 2, minRank: 1 },
   { key: "fine", k: 0.45, dc: 4, minRank: 2 },
   { key: "jewellers", k: 0.3, dc: 7, minRank: 3 },
   { key: "flawless", k: 0.2, dc: 10, minRank: 4 },
   { key: "absolute", k: 0, dc: null, minRank: null },
]

/** Rough work: the grade anyone can do, and the one a check is rated against. */
export const ROUGH_TIER = 1

/** Flawless: the finest grade anybody may deliberately attempt. */
export const FINEST_TIER = 5

/**
 * The grades a given Crafting proficiency may attempt.
 *
 * Each entry carries its own index, because the index is what travels on a
 * chat card and what every other function here takes — the array position is
 * the identity of a grade, not its name.
 *
 * @param {number} rank  0 untrained … 4 legendary.
 * @returns {Array<{index: number, key: string, k: number, dc: number}>}
 */
export function getSelectableTiers(rank = 0) {
   const highest = Math.min(FINEST_TIER, ROUGH_TIER + Math.max(0, rank))

   const tiers = []
   for (let index = ROUGH_TIER; index <= highest; index += 1)
      tiers.push({ index, ...REPAIR_TIERS[index] })

   return tiers
}

/**
 * Where an outcome moves the grade actually delivered.
 *
 * A critical success is one grade better than attempted, a critical failure
 * one grade worse; a plain success or failure delivers what was attempted.
 * The two unselectable ends exist exactly to receive these shifts, and the
 * clamp keeps them from running past.
 *
 * This replaced a flat multiplier that made every critical success free. It
 * no longer is: free repair is the reward for a critical success **from
 * Flawless**, because only there does the step up land on Absolute. A bodger
 * who rolls well gets neat work, not a miracle.
 *
 * @param {number} tierIndex  the grade attempted.
 * @param {string} outcome
 * @returns {number} the grade delivered.
 */
export function shiftTier(tierIndex, outcome) {
   const shift =
      outcome === "criticalSuccess" ? 1 : outcome === "criticalFailure" ? -1 : 0

   return Math.max(0, Math.min(REPAIR_TIERS.length - 1, tierIndex + shift))
}

/**
 * What a grade costs this particular item, per point of damage repaired.
 *
 * The material sets the scale (`profile.mod` is Base ÷ divisor) and the grade
 * scales it down. An item outside the wear system has no profile and so no
 * fatigue at all.
 *
 * Note what happens when the product reaches 1: the limit falls by as much as
 * the damage being repaired, so the new ceiling lands at or below where the
 * item already sits and the repair gives nothing back. That is not an edge
 * case to guard against, it is the rule that expensive gear needs a real
 * smith — see isTierProductive().
 *
 * @param {{mod: number}|null} profile
 * @param {number} tierIndex
 * @returns {number}
 */
export function getTierMod(profile, tierIndex) {
   if (!profile) return 0

   const tier = REPAIR_TIERS[Math.max(0, Math.min(REPAIR_TIERS.length - 1, tierIndex))]
   return profile.mod * tier.k
}

/**
 * Whether a grade can return anything at all on this item.
 *
 * False once `mod × k` reaches 1, which for weapons (divisor 40) means rough
 * work stops working at Base 40 — adamantine, cold iron and noqual at their
 * best — and neat work at Base 61, which only orichalcum reaches. Armour is
 * untouched: its divisor is 80 and the toughest armour in the book is 72.
 *
 * The UI shows such a grade rather than hiding it, and says plainly that it
 * will restore nothing. Hiding it would hide the rule.
 *
 * @param {{mod: number}|null} profile
 * @param {number} tierIndex
 * @returns {boolean}
 */
export function isTierProductive(profile, tierIndex) {
   return !profile || getTierMod(profile, tierIndex) < 1
}

/**
 * How much HP a repair attempt restores, by proficiency rank.
 *
 * RAW: a success restores 5 HP per rank above untrained, a critical success
 * twice that. A Crafter's Eyepiece doubles both, which is the entire reason
 * anyone buys one.
 *
 * @param {number} rank  0 untrained … 4 legendary.
 * @param {boolean} hasEyepiece
 * @returns {{baseHeal: number, critHeal: number}}
 */
export function getHealingValues(rank, hasEyepiece = false) {
   const success = hasEyepiece ? [10, 20, 30, 40, 50] : [5, 10, 15, 20, 25]
   const critical = hasEyepiece ? [15, 30, 45, 60, 75] : [10, 20, 30, 40, 50]

   return {
      baseHeal: success[rank] || 0,
      critHeal: critical[rank] || 0,
   }
}

/**
 * Work out a check's degree of success.
 *
 * PF2e normally hands the outcome to a roll callback, but not always, so this
 * exists as a fallback — and, being written out, it also documents the rule
 * the fallback has to reproduce: ten over is a step up, ten under a step
 * down, and a natural 20 or 1 shifts one further in its own direction.
 *
 * @param {number} total  The check's total.
 * @param {number} dc
 * @param {number|null} dieResult  The face of the d20, for the 20/1 shift.
 * @returns {"criticalSuccess"|"success"|"failure"|"criticalFailure"}
 */
export function getDegreeOfSuccess(total, dc, dieResult = null) {
   let degree =
      total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1

   if (dieResult === 20) degree = Math.min(3, degree + 1)
   if (dieResult === 1) degree = Math.max(0, degree - 1)

   return ["criticalFailure", "failure", "success", "criticalSuccess"][degree]
}

/**
 * How much HP an outcome is worth, given the repairer's skill.
 *
 * A failure restores nothing. A critical failure restores nothing either —
 * the RAW 2d6 damage is replaced in this homebrew by a double loss of the
 * repair limit, which is applied when the repair lands rather than here.
 *
 * @param {string} outcome
 * @param {number} rank
 * @param {boolean} hasEyepiece
 * @returns {number}
 */
export function getHealBudget(outcome, rank, hasEyepiece = false) {
   const { baseHeal, critHeal } = getHealingValues(rank, hasEyepiece)

   if (outcome === "criticalSuccess") return critHeal
   if (outcome === "success") return baseHeal
   return 0
}

/**
 * How much of a repair budget an item can actually take.
 *
 * The cap is the repair limit, never the base, and that is the whole point of
 * the system: a tired item cannot be brought back to what it was, however
 * good the roll or the smith. An expert with 15 HP to give, working on a
 * sword at 8 with a limit of 12, restores four of them; the rest is wasted
 * effort.
 *
 * `fullRepair` is a deliberate departure from RAW, and the default for this
 * homebrew. By the book a repair restores a fixed number of hit points, so
 * bringing a badly damaged item back to full means rolling again and again;
 * with this on, one successful check takes the item all the way to its repair
 * limit. The balance the system is built around lives in the limit, not in
 * how many times someone re-rolls the same check at camp — and the repeated
 * rolls were only ever a tax on the table's patience.
 *
 * Failure is unaffected: a budget of zero restores nothing either way.
 *
 * Hit points only ever go **up** here, which the outer Math.max is there to
 * guarantee. On an item where the grade's `mod × k` has reached 1 the new
 * limit lands below what the item is already carrying, and "repair up to the
 * limit" would then quietly file hit points off a sword somebody just spent
 * ten minutes fixing. A repair that gives nothing back must still not take
 * anything away.
 *
 * @param {{currentHp: number, repairLimit: number, healBudget: number,
 *   fullRepair?: boolean}} input
 * @returns {{restored: number, hpAfter: number}}
 */
export function calcRepairHeal({
   currentHp,
   repairLimit,
   healBudget,
   fullRepair = false,
}) {
   const ceiling =
      fullRepair && healBudget > 0
         ? repairLimit
         : Math.min(repairLimit, currentHp + Math.max(0, healBudget))

   const hpAfter = Math.max(currentHp, ceiling)

   return { restored: hpAfter - currentHp, hpAfter }
}

/** Repair is an exploration activity: ten minutes per attempt. */
export const MINUTES_PER_REPAIR_ATTEMPT = 10

/**
 * How much repair limit a field repair costs.
 *
 *   loss = (repair limit − current HP) × mod
 *
 * The worse the shape an item is in when you patch it, the more of its future
 * you spend doing so. Topping up a blade that is barely scratched is nearly
 * free; dragging one back from the brink is what wears it out for good. That
 * is the shape of the whole system in one line, and it is why players end up
 * choosing between fixing something now and carrying it home.
 *
 * `mod` is the grade's mod, not the material's — getTierMod() has already
 * folded in how finely the work was done. There used to be an outcome
 * multiplier here as well; the outcome now moves the grade instead, which is
 * the same idea expressed once rather than twice.
 *
 * Returns a fractional number on purpose — resolving the fraction is a roll,
 * and that happens in resolveLimitLoss().
 *
 * @param {{repairLimit: number, currentHp: number, mod: number}} input
 * @returns {number}
 */
export function calcRepairLimitLoss({ repairLimit, currentHp, mod }) {
   return Math.max(0, (repairLimit - currentHp) * mod)
}

/**
 * Turn a fractional loss into whole points.
 *
 * The integer part is certain; the fraction is the chance of one more. A loss
 * of 7.5 is seven for sure and a coin flip for the eighth.
 *
 * Rolling the fraction rather than rounding it keeps the average exactly
 * right. Rounding down would quietly favour light materials, which take many
 * small losses where heavy ones take few large ones, and the parity between
 * the two is the thing the ladder was tuned for.
 *
 * @param {number} loss
 * @param {number} percentRoll  1–100, as rolled.
 * @returns {number}
 */
export function resolveLimitLoss(loss, percentRoll) {
   const whole = Math.floor(loss)
   const fraction = loss - whole

   return whole + (percentRoll <= fraction * 100 ? 1 : 0)
}

/**
 * How long a repair took, in minutes.
 *
 * Ten minutes buys one full budget of hit points, and part of a budget costs
 * part of the time. There is always exactly one check — one press of one
 * button — so this is not a count of attempts; it is what the work the check
 * represents would have taken by the book, turned into a duration the table
 * can hear.
 *
 * Time is linear, deliberately. Rounding up to whole ten-minute spans charged
 * a smith who got one hit point back the same as one who got ten, which made
 * the crude grades look far worse than they are: their whole appeal is that
 * they succeed often and finish quickly, and rounding hid exactly that.
 *
 * Work that returns nothing still costs a span. A failure is ten minutes of
 * fruitless filing, and so is a "success" on an item too fine for the grade
 * attempted.
 *
 * @param {{restored: number, healPerAttempt: number,
 *   minutesPerAttempt?: number}} input
 * @returns {{minutes: number}}
 */
export function calcRepairTime({
   restored,
   healPerAttempt,
   minutesPerAttempt = MINUTES_PER_REPAIR_ATTEMPT,
}) {
   if (!(restored > 0) || !(healPerAttempt > 0))
      return { minutes: minutesPerAttempt }

   return { minutes: (restored / healPerAttempt) * minutesPerAttempt }
}

/**
 * What each outcome would do, at a grade the repairer is considering.
 *
 * Pure arithmetic over a hypothetical, so the window can redraw the whole
 * forecast as somebody scrolls the dropdown without touching the item. Nothing
 * here rolls anything: the fractional part of a limit loss is reported as the
 * fraction it is, because on the day it will be a d100.
 *
 * The forecast is per outcome rather than an average on purpose. An average
 * would hide the thing a player actually weighs — that the same grade is
 * nearly free when it goes well and expensive when it does not — and hide it
 * behind a number that never happens.
 *
 * @param {{profile: object|null, repairLimit: number, currentHp: number,
 *   baseDc: number, tierIndex: number, baseHeal?: number, critHeal?: number,
 *   fullRepair?: boolean}} input
 * @returns {{dc: number, tierIndex: number, productive: boolean,
 *   outcomes: Record<string, object>}}
 */
export function previewRepair({
   profile,
   repairLimit,
   currentHp,
   baseDc,
   tierIndex,
   baseHeal = 0,
   critHeal = 0,
   fullRepair = false,
}) {
   const attempted = Math.max(
      ROUGH_TIER,
      Math.min(FINEST_TIER, Math.floor(tierIndex)),
   )

   const forecast = (outcome, healBudget) => {
      const delivered = shiftTier(attempted, outcome)

      const limitLoss = profile
         ? calcRepairLimitLoss({
              repairLimit,
              currentHp,
              mod: getTierMod(profile, delivered),
           })
         : 0

      /* Fractional on purpose — the whole part is certain and the rest is a
       * chance, so rounding it here would report a certainty that is not one. */
      const limitAfter = profile
         ? Math.min(profile.base, Math.max(profile.bt, repairLimit - limitLoss))
         : repairLimit

      const damage =
         outcome === "criticalFailure"
            ? Math.min(currentHp, REPAIR_CRIT_FAILURE_DAMAGE)
            : 0

      /* Hit points are whole, and the limit here is not: its fraction is a
       * chance that has not been rolled yet. Forecasting against the certain
       * part promises only what the repair can actually guarantee — rounding
       * the other way would advertise a hit point the d100 may refuse. */
      const { restored } = calcRepairHeal({
         currentHp: currentHp - damage,
         repairLimit: Math.floor(limitAfter),
         healBudget,
         fullRepair,
      })

      return {
         tierIndex: delivered,
         key: REPAIR_TIERS[delivered].key,
         limitLoss,
         limitAfter,
         restored,
         damage,
      }
   }

   return {
      dc: baseDc + REPAIR_TIERS[attempted].dc,
      tierIndex: attempted,
      productive: isTierProductive(profile, attempted),
      outcomes: {
         criticalSuccess: forecast("criticalSuccess", critHeal),
         success: forecast("success", baseHeal),
         failure: forecast("failure", 0),
         criticalFailure: forecast("criticalFailure", 0),
      },
   }
}

/**
 * Apply a field repair to an item: the fatigue first, then the healing.
 *
 * The order is the rule, not an implementation detail. The limit is spent
 * against the damage the item is carrying, and only then is it patched up to
 * whatever ceiling is left — so a repair never quite restores what it looks
 * like it should, and the gap widens every time. Healing first and eroding
 * afterwards would give back hit points the item was never entitled to.
 *
 * The item's state is read here and now rather than taken from the card that
 * offered the repair. Between someone rolling and someone applying, the sword
 * can take another hit — working from a number printed on an older card would
 * hand back HP it has since lost.
 *
 * What does come from the card is the budget and the outcome, because the
 * person applying cannot see the repairer's sheet and has no way to work out
 * what an expert with a Crafter's Eyepiece was worth.
 *
 * `onceKey` is the same guard the wear system uses, and it matters more here:
 * both the limit and the hit points move in one update, so a duplicate click
 * cannot land half of a repair.
 *
 * @param {Item} item
 * @param {{healBudget?: number, outcome?: string, percentRoll?: number,
 *   onceKey?: string}} [options]
 *   `percentRoll` is the d100 for the fractional part of the limit loss,
 *   rolled by the caller. A critical failure needs no roll of its own — its
 *   damage is flat. `tierIndex` is the grade the repairer chose; the outcome
 *   may still deliver one either side of it.
 * @returns {Promise<object|null>}
 */
export async function applyRepair(
   item,
   {
      healBudget = 0,
      outcome = "success",
      percentRoll = 100,
      tierIndex = ROUGH_TIER,
      onceKey,
   } = {},
) {
   if (!item) return null
   if (onceKey && item.getFlag("world", "lastRepairKey") === onceKey)
      return null

   const profile = getWearProfile(item)
   const limitBefore = getRepairLimit(item)
   if (!(limitBefore > 0)) return null

   /* A shield keeps its hit points where the system put them, not in this
    * module's flags. Shields have no wear profile — the homebrew leaves them
    * to their own Shield Block economy — so nothing below will touch a limit
    * for one; they simply get the plain RAW patch-up, written where the rest
    * of PF2e will see it. */
   const isShield = item.type === "shield"
   const currentHp = isShield
      ? (item.system?.hp?.value ?? limitBefore)
      : (item.getFlag("world", "currentHp") ?? limitBefore)

   /* Which grade the work actually came out at. The repairer chose one; a
    * critical result moves it a step either way, and that single shift is the
    * whole of what a critical does to the limit. */
   const attemptedTier = Math.max(
      ROUGH_TIER,
      Math.min(FINEST_TIER, Math.floor(tierIndex)),
   )
   const deliveredTier = shiftTier(attemptedTier, outcome)

   /* Step one: the limit, measured against the state the item was in when the
    * work started. Outside the wear system there is no limit to lose, and the
    * repair is a plain RAW patch-up. */
   let limitAfter = limitBefore
   let limitLost = 0

   if (profile) {
      const loss = resolveLimitLoss(
         calcRepairLimitLoss({
            repairLimit: limitBefore,
            currentHp,
            mod: getTierMod(profile, deliveredTier),
         }),
         percentRoll,
      )
      limitAfter = clampRepairLimit(profile, limitBefore - loss)
      limitLost = limitBefore - limitAfter
   }

   /* Step two: the point a botched repair costs, straight off the top. No die
    * and no Hardness of any kind — see REPAIR_CRIT_FAILURE_DAMAGE for why both
    * were taken out. Clamped against the item's own HP so a thing already on
    * zero reports no damage rather than going negative. */
   const critDamage =
      outcome === "criticalFailure"
         ? Math.min(currentHp, REPAIR_CRIT_FAILURE_DAMAGE)
         : 0
   const hpAfterDamage = currentHp - critDamage

   // Step three: the healing, against whatever ceiling is left.
   const { restored, hpAfter } = calcRepairHeal({
      currentHp: hpAfterDamage,
      repairLimit: limitAfter,
      healBudget,
      fullRepair: game.settings.get("pf2e-items-sunder-wear", "wearFullRepair"),
   })

   const update = isShield
      ? { "system.hp.value": hpAfter }
      : { "flags.world.currentHp": hpAfter }
   if (onceKey) update["flags.world.lastRepairKey"] = onceKey
   if (limitLost > 0) {
      if (profile && limitAfter >= profile.base)
         update["flags.world.-=repairLimit"] = null
      else update["flags.world.repairLimit"] = limitAfter
   }
   await item.update(update)

   return {
      restored,
      critDamage,
      hpBefore: currentHp,
      hpAfter,
      limitBefore,
      limitAfter,
      limitLost,
      /* Both grades travel back, because the card should say what was
       * attempted and, when a critical moved it, what came out instead. */
      attemptedTier,
      deliveredTier,
      destroyed: hpAfter === 0 && currentHp > 0,
      ...calcRepairTime({ restored, healPerAttempt: healBudget }),
   }
}
