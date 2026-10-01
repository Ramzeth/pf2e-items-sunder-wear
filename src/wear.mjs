/**
 * Wear & Tear — homebrew equipment attrition for PF2e Remaster.
 *
 * The base module tracks a single number: how much HP an item has right now.
 * This layer adds a second, slower-moving number on top of it — the Limit
 * (Предел), the ceiling that current HP can be repaired back up to. Every
 * field repair shaves the Limit down a little, so a blade that has been
 * patched in the woods five times is measurably worse than a fresh one even
 * when it reads "full HP". Only a town forge restores the Limit.
 *
 * Two triggers feed the system:
 *   - weapons take wear damage on a natural 1 on their own attack roll;
 *   - armour takes wear damage when its wearer is critically hit.
 *
 * Material Hardness is deliberately IGNORED by wear damage. A d4 would never
 * get through the Hardness of anything metal, and the system would silently
 * do nothing. Rune Hardness (from the potency rune) is a separate, much
 * smaller number that does apply — that is what makes a runed weapon feel
 * like a reward.
 *
 * This file holds the rules as pure functions. Triggers, chat output and
 * sheet integration live elsewhere so that the numbers stay testable.
 */

import { getDefaultDurability } from "./logic.mjs"

const MODULE_ID = "pf2e-items-sunder-wear"

/**
 * Read an item's pristine base — the HP it had when it left the forge, and the
 * value a town repair restores it to.
 *
 * The base is the module's own `flags.world.maxHp`, unchanged in meaning from
 * before this system existed. That is the whole point of the mapping: vanilla
 * max HP IS the base, vanilla current HP is still current HP, and the Limit is
 * the one genuinely new number stacked on top.
 *
 * Keeping the base in the vanilla field rather than in a flag of its own buys
 * three things. Nothing erodes it, so it cannot drift downwards as an item
 * tires. Nothing has to be written when an item is created, because the module
 * already derives max HP from the material. And with the system switched off
 * there is no extra flag on anything — the module behaves exactly as it always
 * did, because it is reading exactly the field it always read.
 *
 * It is also editable per item in the durability window, which matters for
 * anything the material ladder cannot describe: a unique blade the GM gave 30
 * HP by hand has a base of 30, so its broken threshold and its fatigue
 * multiplier are measured against what it actually is.
 *
 * Falls back to the material ladder for an item the module has never tracked.
 * That is a read-only guess and writes nothing.
 *
 * @param {Item} item
 * @returns {number|null} The base, or null if it cannot be established.
 */
export function getWearBase(item) {
   if (!item) return null

   const base = item.getFlag("world", "maxHp")
   if (base > 0) return base

   const materialBase = getDefaultDurability(item)?.maxHp
   return materialBase > 0 ? materialBase : null
}

/**
 * Collect everything the wear rules need to know about one item.
 *
 * Returns `null` for anything the system does not touch — callers can treat
 * a null profile as "do nothing" and never need to re-check the settings or
 * the item type themselves. That includes the case where the GM has turned
 * the system off entirely, which is why the settings are read here rather
 * than at each trigger site.
 *
 * The three numbers:
 *
 *   base — the item's pristine Limit, from getWearBase() above: normally the
 *     max HP the material ladder in constants.mjs gives it, but the GM can
 *     override it per item. Precious
 *     materials therefore need no special case: they simply start higher,
 *     which in turn yields a proportionally lower mod per point of base, so
 *     adamantine and mithral last longer than the formula would suggest.
 *     Longevity is baked into their price.
 *
 *   bt — the Broken Threshold. 25% of base for weapons, 50% for armour.
 *     They differ because the word "broken" means different things: a broken
 *     weapon cannot be used at all and takes its owner out of the fight,
 *     while broken armour is still worn, keeps its item bonus to AC and only
 *     imposes a status penalty. A weapon therefore gets a lot of room below
 *     "broken" to stay useful; armour needs far less.
 *
 *   mod — how hard the thing is to mend in the field: the share of the damage
 *     that a field repair does NOT give back. Not a rate of decay — nothing
 *     wears out by itself here, an item only loses Limit when somebody
 *     repairs it. Rope is retied and is as good as new (0.20); steel wants a
 *     forge, so a roadside patch costs half of what it mends (0.50).
 *
 *     base / 40 for weapons, base / 80 for armour. The divisors are chosen so
 *     that every item on the ladder survives roughly the same number of
 *     triggers regardless of how sturdy it is — 208-225 attacks for weapons,
 *     13.7-15.5 crits for armour. The flavour lives in the number of repairs,
 *     not in the lifespan: padded armour is stitched up eleven times, plate
 *     is straightened four times and then only a forge will do.
 *
 *     The ladder tops out at exactly 0.50 in both systems — metal weapons
 *     (base 20 / 40) and plate (base 40 / 80). Precious materials run past
 *     that, and above 1.00 a repair would cost more Limit than the HP it
 *     returns. The repair grades answer this without touching the formula:
 *     what counts is mod × k, so a grade whose product has reached 1 simply
 *     does nothing on that item and a finer hand is needed. See "An expensive
 *     item needs a master" in docs/iznos-snaryazheniya.md §7.
 *
 * Excluded on purpose:
 *   - shields, which already have Shield Block attrition in RAW;
 *   - armour with no AC bonus (mage robes, explorer's clothing) — it exists
 *     to carry runes, not to be a resource, so there is nothing to wear out;
 *   - everything that is not a weapon or a piece of armour.
 *
 * @param {Item} item  A PF2e item document.
 * @returns {{kind: "weapon"|"armor", base: number, bt: number, mod: number}|null}
 */
export function getWearProfile(item) {
   if (!item) return null
   if (!game.settings.get(MODULE_ID, "enableWearSystem")) return null

   const isWeapon = item.type === "weapon"
   const isArmour = item.type === "armor"
   if (!isWeapon && !isArmour) return null

   const sideEnabled = game.settings.get(
      MODULE_ID,
      isWeapon ? "enableWeaponWear" : "enableArmourWear",
   )
   if (!sideEnabled) return null

   // Armour that grants no item bonus to AC is outside the system.
   if (isArmour && !(Number(item.system.acBonus) > 0)) return null

   /* Unarmed attacks are weapon-type items in PF2e — a fist has a category
    * rather than a base item — so without this they would fall through to the
    * generic 10 HP default and start wearing out. A fist is not equipment and
    * has nothing to repair. */
   if (isWeapon && item.system.category === "unarmed") return null

   const base = getWearBase(item)
   if (!(base > 0)) return null

   const divisor = Number(
      game.settings.get(
         MODULE_ID,
         isWeapon ? "wearWeaponDivisor" : "wearArmourDivisor",
      ),
   )
   const btPercent = Number(
      game.settings.get(
         MODULE_ID,
         isWeapon ? "wearWeaponBtPercent" : "wearArmourBtPercent",
      ),
   )

   return {
      kind: isWeapon ? "weapon" : "armor",
      base,
      // Rounded down: a threshold of 4.5 means the item is broken at 4, not
      // at 5, which keeps one extra point of useful life on odd ladders.
      bt: Math.floor((base * btPercent) / 100),
      // Carried in the profile so the durability window can recompute the
      // threshold live while the GM types, without duplicating the "which
      // setting applies to which item type" decision.
      btPercent,
      // A divisor of 0 would be a division by zero; treat it as "the Limit
      // never erodes", which is a legitimate way to run the system with
      // wear damage but without fatigue.
      mod: divisor > 0 ? base / divisor : 0,
   }
}

/**
 * Rune Hardness — how much of each wear hit the item's potency rune shrugs
 * off. Zero without a rune, otherwise the rune's rank: 1, 2 or 3.
 *
 * This is not the item's material Hardness. Material Hardness is ignored by
 * wear entirely, because a d4 would never get through the Hardness of
 * anything metal and the system would quietly do nothing. Rune Hardness is a
 * much smaller number applied to a much smaller die, and it is what turns a
 * runed weapon into a reward: at +1 a blade lasts roughly twice as long, at
 * +2 three times over, and a +3 weapon effectively never wears out.
 *
 * Read from the rune backup first. When an item breaks, the module strips
 * `system.runes` and parks the original in `flags.world.runesBackup` to
 * suppress the rune's mechanical bonus — but the rune is still physically on
 * the item, so it should still blunt wear. This matters for armour, which is
 * worn and keeps taking crits after it breaks; a broken suit reading zero
 * potency would suddenly erode three times faster than the rules intend.
 * Weapons never hit this path — a broken weapon cannot be used, so it never
 * takes wear damage in the first place.
 *
 * Armour potency counts exactly as weapon potency does. The armour rules do
 * not spell this out, but they defer to the weapon document for everything
 * they do not restate, and the alternative — runed armour wearing out as fast
 * as plain armour while runed weapons do not — would split the two systems
 * for no reason.
 *
 * @param {Item} item
 * @returns {number} Hardness to subtract from a wear hit, never negative.
 *   Callers that need to know whether the item is in the system at all should
 *   check getWearProfile(); this function only reports the rune.
 */
export function getRuneHardness(item) {
   if (!item) return 0

   const runes = item.getFlag("world", "runesBackup") ?? item.system?.runes
   const potency = Number(runes?.potency)

   return Number.isFinite(potency) && potency > 0 ? potency : 0
}

/**
 * The HP at or below which an item counts as broken.
 *
 * One function for the whole module, because three different rules apply
 * depending on the item:
 *
 *   Inside the Wear & Tear system — a percentage of the item's BASE, not of
 *     its current Limit. This is the detail the whole repair economy rests
 *     on: the threshold is fixed at the forge and does not sink as the Limit
 *     erodes. The gap between the two closes from above, so a tired item
 *     breaks sooner and sooner, and eventually the gap drops below one point
 *     and field repair stops being possible at all. A threshold measured
 *     against the current Limit would instead keep a constant gap, and an
 *     item would never actually wear out.
 *
 *   Shields — PF2e tracks a real broken threshold on the item itself, and it
 *     is not always half of max. Use what the system says.
 *
 *   Everything else, and everything when the system is switched off — half of
 *     max HP, which is what the module has always done and what RAW says.
 *
 * @param {Item} item
 * @param {number} [base]  Only matters for items outside the system, and only
 *   worth passing when the base is changing in an update that has not been
 *   written yet. Defaults to the item's stored base.
 * @returns {number}
 */
export function getBrokenThreshold(item, base = getWearBase(item)) {
   const profile = getWearProfile(item)
   if (profile) return profile.bt

   const shieldThreshold = item?.system?.hp?.brokenThreshold
   if (item?.type === "shield" && shieldThreshold >= 0) return shieldThreshold

   return base > 0 ? Math.floor(base / 2) : 0
}

/**
 * Read an item's current Limit — the ceiling its current HP can be repaired
 * back up to, which erodes a little with every field repair.
 *
 * The name says what it is: the ceiling repair can reach. Field repair lowers
 * it a little every time, town repair restores it to the base.
 *
 * This is the answer to every "how high can this item be healed" question in
 * the module, and the one place a mix-up with the base would go unnoticed:
 * healing an item up to its base instead of its repair limit undoes the
 * fatigue silently, and the whole system looks like it does nothing.
 *
 * Stored in `flags.world.repairLimit`. No flag means "at the base", so a fresh
 * item carries nothing extra, and a town repair restores an item by clearing
 * the flag rather than by writing a number into it.
 *
 * Items outside the system have no separate limit — their ceiling is their
 * base, exactly as the module has always treated max HP. This function answers
 * for them too, so callers ask one question instead of branching on whether
 * the system is switched on.
 *
 * @param {Item} item
 * @returns {number|null} The ceiling current HP may reach, or null when the
 *   item has no tracked durability at all and the caller should use whatever
 *   default it normally would.
 */
export function getRepairLimit(item) {
   if (!item) return null

   if (item.type === "shield") {
      const shieldCeiling = item.system.hp?.max
      return shieldCeiling > 0 ? shieldCeiling : null
   }

   const profile = getWearProfile(item)
   if (profile) {
      const repairLimit = item.getFlag("world", "repairLimit")
      return repairLimit > 0 ? repairLimit : profile.base
   }

   const base = item.getFlag("world", "maxHp")
   return base > 0 ? base : null
}

/**
 * How much of a wear hit actually lands, and where it leaves the item.
 *
 * Pure: no rolling, no writing, no Foundry. The caller supplies the die
 * result so this can be reasoned about and tested on its own.
 *
 *   applied = max(0, rolled − rune hardness)
 *   hpAfter = max(0, current HP − applied)
 *
 * NOTE — this deliberately departs from the rules documents. Both of them say
 * a single wear hit "does not take the item below its broken threshold", with
 * the excess lost, so that an item must always pass through broken before it
 * can be destroyed. That clamp is not implemented: wear damage lands in full,
 * and an item low enough can be destroyed outright by one trigger. The GM
 * chose this deliberately — a light suit of armour being fragile is the
 * point, and the material assigned to an item is the dial for it. Do not
 * "restore" the clamp to match the documents; the documents are what is out
 * of date.
 *
 * `flat` is the cost of swinging a broken weapon, and it is added after the
 * rune has had its say rather than before. That asymmetry is the rule: a rune
 * blunts the damage a fumble does to a blade, but nothing softens the toll of
 * using one that is already ruined. Keeping both terms in one expression is
 * what makes the asymmetry visible instead of a matter of remembering which
 * function to call.
 *
 * @param {{currentHp: number, rolled?: number, runeHardness?: number,
 *   flat?: number}} input
 * @returns {{applied: number, hpAfter: number}}
 */
export function calcWearDamage({
   currentHp,
   rolled = 0,
   runeHardness = 0,
   flat = 0,
}) {
   const applied = flat + Math.max(0, rolled - runeHardness)
   return { applied, hpAfter: Math.max(0, currentHp - applied) }
}

/**
 * Apply everything one attack roll costs an item.
 *
 * One function rather than one per rule, because a single roll can owe on two
 * counts at once: a broken weapon that comes up a natural 1 pays the flat
 * price of the swing AND takes the fumble die. Those are two rules in the
 * documents, but they are one debt against one item, and settling them in one
 * write is what keeps the idempotency key honest — a single key cannot guard
 * two separate updates without one of them overwriting the other's record.
 *
 * Fighting on with a ruined blade is therefore a gamble rather than a
 * predictable countdown: five swings is what a steel blade at a threshold of
 * five owes you, and any one of them can come up a 1 and end it early.
 *
 * The die is rolled by the caller. Keeping Foundry's Roll out of the rules
 * layer is what lets all of this be tested without a world.
 *
 * Armour needs no special case anywhere here. It keeps being worn and keeps
 * taking crits after it breaks, on the same die, all the way to zero.
 *
 * Destruction needs no special handling either: writing 0 current HP is
 * enough, and preUpdateItem in item-hooks.mjs already unequips the item and
 * refuses to let it be equipped again.
 *
 * `onceKey` makes the call idempotent. Foundry has no compare-and-swap, so
 * two clients that press the same button in the same instant can both get
 * this far; the key is written in the same update as the hit, which at least
 * means a click arriving after the first has landed does nothing instead of
 * charging the item twice. It does not close the window entirely — nothing
 * available in Foundry does — but it shrinks it to the time an item update
 * takes to reach the other client.
 *
 * Returns what the chat card needs, or null when nothing happened at all.
 *
 * @param {Item} item
 * @param {{rolled?: number, flat?: number, onceKey?: string}} [options]
 *   `rolled` is what the wear die came up, `flat` the cost of the swing
 *   itself. Either may be zero; if both are, nothing is owed.
 * @returns {Promise<object|null>}
 */
export async function applyWearHit(item, { rolled = 0, flat = 0, onceKey } = {}) {
   const profile = getWearProfile(item)
   if (!profile || !(rolled >= 0) || !(flat >= 0)) return null
   if (onceKey && item.getFlag("world", "lastWearKey") === onceKey) return null

   const currentHp = item.getFlag("world", "currentHp") ?? getRepairLimit(item)
   if (!(currentHp > 0)) return null

   const runeHardness = getRuneHardness(item)
   const { applied, hpAfter } = calcWearDamage({
      currentHp,
      rolled,
      runeHardness,
      flat,
   })

   if (hpAfter !== currentHp || onceKey) {
      const update = { "flags.world.currentHp": hpAfter }
      if (onceKey) update["flags.world.lastWearKey"] = onceKey
      await item.update(update)
   }

   return {
      rolled,
      flat,
      runeHardness,
      applied,
      hpBefore: currentHp,
      hpAfter,
      brokenThreshold: profile.bt,
      becameBroken: currentHp > profile.bt && hpAfter <= profile.bt,
      becameDestroyed: hpAfter === 0,
   }
}

/**
 * Hold a repair limit inside what the rules allow.
 *
 * Three clamps, each for its own reason:
 *
 *   Lower bound — the broken threshold. The limit never erodes below it. This
 *     is the cutoff from the fatigue rules: once `limit − threshold < 1` there
 *     is no room left to lose, field repair stops being possible and only a
 *     town forge can help. Enforcing it here means no caller can accidentally
 *     fatigue an item out of existence.
 *
 *   Upper bound — the base. An item cannot be repaired past what it was built
 *     to be, and a limit at the base is the same thing as no limit at all.
 *
 *   Integer. The cycle tables in the rules show fractional limits (22.5,
 *     21.25) — those are expected values used to illustrate the curve, not
 *     numbers that appear at the table. In play the fractional part of a loss
 *     is resolved by a roll ("a loss of 7.5 means minus 7, plus a 50% chance
 *     at the eighth"), so the stored limit is always a whole number.
 *
 * Its own function because two callers need exactly these three rules: field
 * repair erodes the limit, a town repair restores it, and a second copy of
 * the clamping would eventually drift from the first.
 *
 * @param {{base: number, bt: number}} profile
 * @param {number} value
 * @returns {number}
 */
export function clampRepairLimit(profile, value) {
   return Math.min(profile.base, Math.max(profile.bt, Math.floor(value)))
}

/**
 * Write a new repair limit.
 *
 * Reaching the base clears the flag rather than storing a number equal to it,
 * because "at the base" and "no limit recorded" are the same state. That is
 * what a town repair does.
 *
 * Current HP above the new limit is not trimmed here: `preUpdateItem` in
 * item-hooks.mjs already does that for any incoming ceiling, and doing it in
 * two places would only risk the two disagreeing.
 *
 * @param {Item} item
 * @param {number} value  The desired new limit, before clamping.
 * @returns {Promise<void>}
 */
export async function setRepairLimit(item, value) {
   const profile = getWearProfile(item)
   if (!profile || !(value >= 0)) return

   const current = getRepairLimit(item)
   const next = clampRepairLimit(profile, value)
   if (next === current) return

   await item.update(
      next >= profile.base
         ? { "flags.world.-=repairLimit": null }
         : { "flags.world.repairLimit": next },
   )
}
