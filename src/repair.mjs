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

import {
   calcWearDamage,
   clampRepairLimit,
   getRepairLimit,
   getRuneHardness,
   getWearProfile,
} from "./wear.mjs"

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
   const hpAfter =
      fullRepair && healBudget > 0
         ? repairLimit
         : Math.min(repairLimit, currentHp + Math.max(0, healBudget))

   return { restored: Math.max(0, hpAfter - currentHp), hpAfter }
}

/** Repair is an exploration activity: ten minutes per attempt. */
export const MINUTES_PER_REPAIR_ATTEMPT = 10

/**
 * What an outcome costs the repair limit, as a multiple of the formula.
 *
 * A critical success is the only way to patch something up for free, and that
 * is the reward the whole degree table is built around: an expert working
 * carefully can keep a blade going indefinitely, everyone else is spending it.
 *
 * Everything else costs the same. A plain failure costs because ten minutes
 * of the wrong kind of attention does an item no good, and that is what makes
 * an untrained character think twice before volunteering to fix the party's
 * runed sword.
 *
 * A critical failure once cost double, and it was too sharp by far: at a
 * limit of 12 on a badly damaged blade it took the item straight to its
 * broken threshold on one roll, with no warning and nothing to be done about
 * it. It now costs the same as a failure and adds a wear die on top — see
 * applyRepair(). Damage is the better punishment because it can be repaired
 * again, where a lost limit never comes back.
 */
export function getLimitLossMultiplier(outcome) {
   return outcome === "criticalSuccess" ? 0 : 1
}

/**
 * How much repair limit a field repair costs.
 *
 *   loss = (repair limit − current HP) × mod × multiplier
 *
 * The worse the shape an item is in when you patch it, the more of its future
 * you spend doing so. Topping up a blade that is barely scratched is nearly
 * free; dragging one back from the brink is what wears it out for good. That
 * is the shape of the whole system in one line, and it is why players end up
 * choosing between fixing something now and carrying it home.
 *
 * Returns a fractional number on purpose — resolving the fraction is a roll,
 * and that happens in resolveLimitLoss().
 *
 * @param {{repairLimit: number, currentHp: number, mod: number,
 *   multiplier?: number}} input
 * @returns {number}
 */
export function calcRepairLimitLoss({
   repairLimit,
   currentHp,
   mod,
   multiplier = 1,
}) {
   return Math.max(0, (repairLimit - currentHp) * mod * multiplier)
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
 * How long a repair took.
 *
 * There is always exactly one attempt: one press of one button, one check.
 * `rawAttempts` is not a count of anything that happened — it is the number
 * of ten-minute attempts the same result would have cost by the book, and it
 * exists only to turn that into a duration.
 *
 * That distinction is worth keeping straight, because printing it as a count
 * of attempts would describe a scene that never took place. The table sees a
 * duration; the arithmetic behind it stays here.
 *
 * A failure costs one span too. Ten minutes of fruitless work is exactly what
 * a failed repair is.
 *
 * @param {{restored: number, healPerAttempt: number,
 *   minutesPerAttempt?: number}} input
 * @returns {{rawAttempts: number, minutes: number}}
 */
export function calcRepairTime({
   restored,
   healPerAttempt,
   minutesPerAttempt = MINUTES_PER_REPAIR_ATTEMPT,
}) {
   const rawAttempts =
      healPerAttempt > 0 ? Math.max(1, Math.ceil(restored / healPerAttempt)) : 1

   return { rawAttempts, minutes: rawAttempts * minutesPerAttempt }
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
 *   critFailRoll?: number, onceKey?: string}} [options]
 *   `critFailRoll` is the wear die, rolled by the caller, and is only read on
 *   a critical failure.
 * @returns {Promise<object|null>}
 */
export async function applyRepair(
   item,
   {
      healBudget = 0,
      outcome = "success",
      percentRoll = 100,
      critFailRoll = 0,
      onceKey,
   } = {},
) {
   if (!item) return null
   if (onceKey && item.getFlag("world", "lastRepairKey") === onceKey)
      return null

   const profile = getWearProfile(item)
   const limitBefore = getRepairLimit(item)
   if (!(limitBefore > 0)) return null

   const currentHp = item.getFlag("world", "currentHp") ?? limitBefore

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
            mod: profile.mod,
            multiplier: getLimitLossMultiplier(outcome),
         }),
         percentRoll,
      )
      limitAfter = clampRepairLimit(profile, limitBefore - loss)
      limitLost = limitBefore - limitAfter
   }

   /* Step two: the damage a botched repair does, on the same die and the same
    * terms as a fumbled swing. Material Hardness is ignored here as it is
    * everywhere in this system — a d4 would never get through steel and the
    * rule would quietly do nothing — but the potency rune blunts it, because
    * a runed item resists being spoiled whatever spoiled it. */
   let critDamage = 0
   let hpAfterDamage = currentHp

   if (outcome === "criticalFailure" && critFailRoll > 0) {
      const spoiled = calcWearDamage({
         currentHp,
         rolled: critFailRoll,
         runeHardness: getRuneHardness(item),
      })
      critDamage = spoiled.applied
      hpAfterDamage = spoiled.hpAfter
   }

   // Step three: the healing, against whatever ceiling is left.
   const { restored, hpAfter } = calcRepairHeal({
      currentHp: hpAfterDamage,
      repairLimit: limitAfter,
      healBudget,
      fullRepair: game.settings.get("pf2e-items-sunder-wear", "wearFullRepair"),
   })

   const update = { "flags.world.currentHp": hpAfter }
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
      destroyed: hpAfter === 0 && currentHp > 0,
      ...calcRepairTime({ restored, healPerAttempt: healBudget }),
   }
}
