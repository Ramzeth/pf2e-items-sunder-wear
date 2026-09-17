/**
 * The testable half of the wear triggers.
 *
 * Everything that knows how PF2e shapes a chat message needs a live world and
 * is not covered here — that split is the reason the rules live in pure
 * functions and the message parsing sits in a thin layer of its own.
 *
 * Run with:  node --test test/triggers.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"

globalThis.Hooks = { on: () => {} }
globalThis.game = { settings: { get: () => undefined } }

const {
   getActiveDieResult,
   isFumbleTrigger,
   isCritTrigger,
   isBrokenStrikeTrigger,
} = await import("../src/hooks/wear-hooks.mjs")

/* ------------------------------------------------------------------ *
 * Reading the d20
 * ------------------------------------------------------------------ */

const rollWith = (...results) => ({ dice: [{ results }] })

test("a plain roll reports its only face", () => {
   assert.equal(getActiveDieResult(rollWith({ result: 1, active: true })), 1)
   assert.equal(getActiveDieResult(rollWith({ result: 17, active: true })), 17)
})

/* A hero point reroll, Assurance or any keep-highest effect leaves both faces
 * in the results array with one of them discarded. Reading results[0] would
 * sometimes read the die that did not count. */
test("a rerolled check reports the face that survived", () => {
   const kept = rollWith(
      { result: 1, active: false, discarded: true },
      { result: 14, active: true },
   )
   assert.equal(getActiveDieResult(kept), 14, "the 1 was rerolled away")

   const fumbledReroll = rollWith(
      { result: 12, active: false, discarded: true },
      { result: 1, active: true },
   )
   assert.equal(
      getActiveDieResult(fumbledReroll),
      1,
      "and a reroll INTO a 1 still counts",
   )
})

test("a roll with nothing to read reports null", () => {
   assert.equal(getActiveDieResult(undefined), null)
   assert.equal(getActiveDieResult({}), null)
   assert.equal(getActiveDieResult(rollWith()), null)
})

/* ------------------------------------------------------------------ *
 * The trigger itself — iznos-snaryazheniya.md §2
 * "Натуральная 1 на броске атаки → оружие получает 1d4 урона."
 * ------------------------------------------------------------------ */

test("a natural 1 on an attack roll fires the trigger", () => {
   assert.equal(
      isFumbleTrigger({ contextType: "attack-roll", naturalDie: 1 }),
      true,
   )
})

/* The rule is written against the die, not the outcome: a large enough bonus
 * can turn a natural 1 into something that is not a critical failure by the
 * numbers, and the homebrew still charges for it. */
test("the die is what counts, not the degree of success", () => {
   assert.equal(
      isFumbleTrigger({ contextType: "attack-roll", naturalDie: 2 }),
      false,
      "a critical failure on a 2 is not a fumble for wear purposes",
   )
})

test("other kinds of check are left alone", () => {
   for (const contextType of [
      "damage-roll",
      "saving-throw",
      "skill-check",
      "spell-attack-roll",
      undefined,
   ]) {
      assert.equal(
         isFumbleTrigger({ contextType, naturalDie: 1 }),
         false,
         `${contextType} should not trigger wear`,
      )
      assert.equal(
         isCritTrigger({ contextType, outcome: "criticalSuccess" }),
         false,
         `${contextType} should not trigger armour wear`,
      )
   }
})

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §2
 * "Критическое попадание по носителю → броня получает 1d4 урона."
 * ------------------------------------------------------------------ */

test("a critical hit fires the armour trigger", () => {
   assert.equal(
      isCritTrigger({ contextType: "attack-roll", outcome: "criticalSuccess" }),
      true,
   )
})

/* The armour rule reads the outcome, not the die: the blow has to land hard,
 * and how the number got there does not matter. */
test("anything short of a critical hit leaves armour alone", () => {
   for (const outcome of [
      "success",
      "failure",
      "criticalFailure",
      undefined,
   ]) {
      assert.equal(
         isCritTrigger({ contextType: "attack-roll", outcome }),
         false,
         `${outcome} should not wear armour`,
      )
   }
})

/* A natural 1 always drops the degree of success by one step in PF2e, so the
 * two triggers can never both fire on the same roll — which is what lets the
 * weapon button and the armour button share a card without contending. */
test("a natural 1 and a critical hit cannot coexist", () => {
   const fumble = { contextType: "attack-roll", naturalDie: 1 }
   assert.equal(isFumbleTrigger(fumble), true)
   assert.equal(
      isCritTrigger({ ...fumble, outcome: "success" }),
      false,
      "the best a natural 1 can reach is one step below a crit",
   )
})

/* ------------------------------------------------------------------ *
 * iznos-snaryazheniya.md §3 "Удары сломанным оружием"
 * "Каждый удар — 1 урона оружию."
 * ------------------------------------------------------------------ */

const strike = (currentHp) =>
   isBrokenStrikeTrigger({
      contextType: "attack-roll",
      currentHp,
      brokenThreshold: 5,
   })

test("a weapon at or below its threshold is charged for the swing", () => {
   assert.equal(strike(5), true, "exactly at the threshold counts as broken")
   assert.equal(strike(1), true)
})

test("a whole weapon is not charged for swinging", () => {
   assert.equal(strike(6), false)
   assert.equal(strike(20), false)
})

/* Nothing is left to take, and the item is already out of the fight. */
test("a destroyed weapon is not charged", () => {
   assert.equal(strike(0), false)
})

/* The rule is about the swing, not about connecting: the trigger never sees
 * the outcome, so a miss costs exactly what a hit does. That is what makes
 * "five more swings" a number a player can count on. */
test("the swing cost does not depend on hitting", () => {
   for (const outcome of ["criticalSuccess", "success", "failure"]) {
      assert.equal(
         isBrokenStrikeTrigger({
            contextType: "attack-roll",
            outcome,
            currentHp: 3,
            brokenThreshold: 5,
         }),
         true,
         `${outcome} still costs the swing`,
      )
   }
})
