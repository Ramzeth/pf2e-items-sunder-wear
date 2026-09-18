/**
 * Wear & Tear triggers.
 *
 * Nothing here applies wear on its own. Every trigger ends in a button that a
 * human presses, for two reasons.
 *
 * The first is technical. Foundry runs no module code on the server: a chat
 * message is broadcast to every connected browser, and every browser fires
 * its own createChatMessage hook. Anything that wrote to an item from inside
 * such a hook would write once per client. A button sidesteps that entirely —
 * a click happens in exactly one browser by construction.
 *
 * The second is that it matches how the rest of this module already works.
 * chat-hooks.mjs adds a sunder button to damage cards rather than applying
 * damage itself, and vanilla PF2e never auto-applies damage either. The GM
 * stays in the loop.
 *
 * Two triggers, one flow:
 *
 *   natural 1 on an attack   →  the attacker's weapon wears
 *   critical hit on a target →  the defender's worn armour wears
 *
 * In both cases:
 *
 *   1. a button appears on the attack card, shown only to the item's owner
 *      and to GMs — so on a card that offers both, each side sees only their
 *      own
 *   2. one click rolls the die AND applies the hit, and posts a card
 *      reporting both
 *
 * Rolling and applying were once two clicks, so that a number could be looked
 * at before it was committed to. They were merged because everyone who can
 * see the button can already write to the item — the split bought a pause to
 * think and cost an intermediate state that had to be stored, guarded and
 * retired. The pause is still there, just earlier: it sits in front of the
 * button rather than behind it.
 *
 * Two people can hold the same button — the owner and the GM. Three layers
 * keep that from charging the item twice, and they are described at their
 * respective functions below: retiring the button when the card arrives,
 * refusing to draw it again for a fumble already dealt with, and an
 * idempotency key written into the item itself.
 */

import {
   applyWearHit,
   getRuneHardness,
   getWearProfile,
} from "../wear.mjs"

const MODULE_ID = "pf2e-items-sunder-wear"

/**
 * Layer 2 of 3. Find the card recording that this fumble has already been
 * dealt with, if there is one.
 *
 * This is what a fresh render asks — a reload, a late join, scrolling back
 * through the log — before drawing a button. The live case is layer 1, which
 * watches for the card as it arrives.
 *
 * Walks backwards and stops at the attack message itself: a wear card is
 * always newer than the attack it came from, so anything older cannot be it.
 * That also bounds the search to the part of the log Foundry holds in memory,
 * because newer messages are always loaded before older ones.
 *
 * Only cards written by someone who could actually have done the deed count.
 * Any player may post a chat message with any flags they like, so without
 * this check a bored player could publish a forgery and quietly suppress
 * someone else's button. They still cannot touch the item — the server sees
 * to that — but they could stop the table noticing a fumble.
 *
 * @returns {ChatMessage|null}
 */
function findWearCard(sourceId, itemUuid, item) {
   const messages = game.messages?.contents ?? []
   for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate.id === sourceId) break

      const applied = candidate.flags?.[MODULE_ID]?.wearApplied
      if (applied?.sourceId !== sourceId || applied?.itemUuid !== itemUuid)
         continue

      const author = candidate.author ?? candidate.user
      if (item && author && !item.testUserPermission(author, "OWNER")) continue

      return candidate
   }
   return null
}

/**
 * Layer 1 of 3. Take the button off every copy of an attack card on this
 * screen.
 *
 * A rendered chat card is inert markup and does not redraw itself when
 * something happens elsewhere, so each client has to clear its own view when
 * the wear card arrives.
 */
function retireWearButton(sourceId, itemUuid) {
   document
      .querySelectorAll(
         `.aztec-wear-roll-btn[data-source-id="${sourceId}"]` +
            `[data-item-uuid="${itemUuid}"]`,
      )
      .forEach((button) =>
         (button.closest(".aztec-wear-prompt") ?? button).remove(),
      )
}

/**
 * The face-up value of the d20 in a check, ignoring anything a fortune or
 * misfortune effect threw away.
 *
 * Foundry keeps every rolled face in `results` and marks the survivor. A
 * plain roll has one entry; a hero point reroll, Assurance or a
 * keep-highest effect leaves two, one of them discarded. Reading
 * `results[0]` blindly would sometimes read the die that did not count.
 *
 * Pure, so the awkward part can be tested without Foundry.
 *
 * @param {object} roll  A Foundry Roll, or anything shaped like one.
 * @returns {number|null}
 */
export function getActiveDieResult(roll) {
   const results = roll?.dice?.[0]?.results ?? []
   if (results.length === 0) return null

   const active = results.find((result) => result.active && !result.discarded)
   return (active ?? results[0]).result ?? null
}

/**
 * Whether a chat message is an attack roll that came up a natural 1.
 *
 * The rule is written against the die, not against the outcome. Those come
 * apart: a fighter with a large enough bonus can roll a natural 1 and still
 * not land on a critical failure by the numbers, and it is the 1 that the
 * homebrew cares about.
 *
 * Pure, and deliberately knows nothing about items — item eligibility is
 * getWearProfile()'s job.
 *
 * @param {{contextType: string|undefined, naturalDie: number|null}} facts
 * @returns {boolean}
 */
export function isFumbleTrigger({ contextType, naturalDie }) {
   return contextType === "attack-roll" && naturalDie === 1
}

/**
 * Whether a chat message is an attack that critically hit someone.
 *
 * The armour side of the system, and the mirror image of the weapon's fumble:
 * a weapon is worn down by its wielder's worst rolls, armour by its wearer's
 * worst luck. Here the outcome is what matters rather than the die, because
 * the rule is about the blow landing hard, not about the number on the d20.
 *
 * Pure; the defender and their armour are somebody else's problem.
 *
 * @param {{contextType: string|undefined, outcome: string|undefined}} facts
 * @returns {boolean}
 */
export function isCritTrigger({ contextType, outcome }) {
   return contextType === "attack-roll" && outcome === "criticalSuccess"
}

/**
 * Whether this attack was swung with a weapon that is already broken.
 *
 * Every swing of a ruined blade costs it, hit or miss — the rule is about the
 * swing, not about connecting. That is what makes "a steel blade at a
 * threshold of five gives you five more swings" a number the player can
 * actually count on rather than something that depends on the target's AC.
 *
 * Pure.
 *
 * @param {{contextType: string|undefined, currentHp: number,
 *   brokenThreshold: number}} facts
 * @returns {boolean}
 */
export function isBrokenStrikeTrigger({
   contextType,
   currentHp,
   brokenThreshold,
}) {
   return (
      contextType === "attack-roll" &&
      currentHp > 0 &&
      currentHp <= brokenThreshold
   )
}

/**
 * Pull the facts the rules need out of a PF2e chat message.
 *
 * This is the one place that knows how PF2e shapes its messages, so if a
 * system update moves something, it moves here and nowhere else. It is also
 * the one part of the trigger that cannot be unit tested — it needs a live
 * world — which is exactly why it holds no rules of its own.
 *
 * @param {ChatMessage} message
 * @returns {{contextType: string|undefined, naturalDie: number|null, item: Item|null}}
 */
function readAttackRoll(message) {
   const context = message.flags?.pf2e?.context

   let weapon = message.item ?? null
   if (!weapon) {
      const originUuid = message.flags?.pf2e?.origin?.uuid
      if (originUuid) weapon = fromUuidSync(originUuid) ?? null
   }

   /* The token first, the actor second. A crit against one of three identical
    * unlinked goblins has to land on that goblin's own armour, and only the
    * token knows which one it was. */
   const defender =
      (context?.target?.token
         ? fromUuidSync(context.target.token)?.actor
         : null) ??
      (context?.target?.actor ? fromUuidSync(context.target.actor) : null)

   return {
      contextType: context?.type,
      outcome: context?.outcome,
      naturalDie: getActiveDieResult(message.rolls?.[0]),
      weapon,
      defender,
   }
}

/** The armour a character is currently wearing, if any. */
function getWornArmour(actor) {
   if (!actor) return null
   return (
      actor.wornArmor ??
      actor.itemTypes?.armor?.find((piece) => piece.system?.equipped?.inSlot) ??
      null
   )
}

/** Whether there is anything left of this item for wear to take. */
function isWearable(item, expectedType) {
   if (!item || item.type !== expectedType) return false
   if (!getWearProfile(item)) return false

   const currentHp = item.getFlag("world", "currentHp")
   return currentHp === undefined || currentHp > 0
}

/**
 * What each item owes for one attack roll.
 *
 * A list rather than a single item because one roll can reach two pieces of
 * kit with two different owners — a critical hit landed with a broken weapon
 * costs the attacker their blade and the defender their armour. Those two
 * buttons belong to two different people, which is why this returns a list
 * rather than picking a winner.
 *
 * At most one entry per item, though, and this is the part that matters: a
 * broken weapon that comes up a natural 1 owes on both counts, and both are
 * carried in the same entry. Two entries for one item would mean two buttons,
 * two cards and two idempotency keys where one field can only hold one.
 *
 * A fumble and a critical hit cannot both appear on one roll — a natural 1
 * drops the degree of success by a step in PF2e, so it can never be a
 * critical success — so the weapon entry never owes a die twice.
 *
 * @param {ChatMessage} message
 * @returns {{item: Item, flat: number, rolled: boolean}[]}
 */
function getWearPrompts(message) {
   const facts = readAttackRoll(message)
   if (facts.contextType !== "attack-roll") return []

   const prompts = []

   if (isWearable(facts.weapon, "weapon")) {
      const profile = getWearProfile(facts.weapon)
      const currentHp =
         facts.weapon.getFlag("world", "currentHp") ?? profile.base

      const flat = isBrokenStrikeTrigger({
         contextType: facts.contextType,
         currentHp,
         brokenThreshold: profile.bt,
      })
         ? Number(game.settings.get(MODULE_ID, "wearBrokenStrikeCost") ?? 1)
         : 0

      const rolled = isFumbleTrigger(facts)
      if (flat > 0 || rolled)
         prompts.push({ item: facts.weapon, flat: Math.max(0, flat), rolled })
   }

   if (isCritTrigger(facts)) {
      const armour = getWornArmour(facts.defender)
      if (isWearable(armour, "armor"))
         prompts.push({ item: armour, flat: 0, rolled: true })
   }

   return prompts
}

export function registerWearHooks() {
   Hooks.on("renderChatMessageHTML", (message, htmlElement) => {
      const prompts = getWearPrompts(message)
      if (prompts.length === 0) return

      const html =
         htmlElement instanceof HTMLElement ? htmlElement : htmlElement[0]
      if (!html) return

      for (const { item, flat, rolled } of prompts) {
         /* Who gets the button: the item's owner, and every GM. In Foundry
          * isOwner is already true for a GM, so one check covers the pair.
          * Note that the two buttons on one card can belong to two different
          * people — the attacker sees the one for their weapon, the defender
          * the one for their armour, and neither sees the other's.
          *
          * This is presentation, not security. Anyone can edit their own DOM,
          * so the click handler re-checks, and beneath both of them the
          * server refuses an item update from a user without permission. That
          * last one is the only guarantee; the first two keep a table tidy. */
         if (!item.isOwner) continue

         // Already dealt with. Covers a reload, a late join, scrolling back.
         if (findWearCard(message.id, item.uuid, item)) continue

         const selector = `.aztec-wear-roll-btn[data-item-uuid="${item.uuid}"]`
         if (html.querySelector(selector)) continue

         const container = html.querySelector(".message-content") ?? html

         /* A swing with a broken weapon that did not also fumble throws no
          * die, and a button promising one would be a lie. When both are owed
          * the roll wording wins — a die really is coming, and the extra
          * point is the card's business to explain. */
         const label = rolled
            ? game.i18n.format("pf2e-items-sunder-wear.chat.wear.roll-button", {
                 itemName: item.name,
              })
            : game.i18n.format("pf2e-items-sunder-wear.chat.wear.flat-button", {
                 itemName: item.name,
                 flat,
              })
         const icon = rolled ? "fa-dice-d4" : "fa-hammer-crash"

         /* The uuid rather than a bare id: it carries the actor with it, so
          * the item still resolves from an unlinked token's copy — which is
          * what keeps a crit against one of three identical goblins on that
          * goblin's own armour. source-id ties the button to the attack it
          * grew out of, and the pair is how the card and the button find each
          * other again when it is time to retire it. */
         container.insertAdjacentHTML(
            "beforeend",
            `<div class="aztec-wear-prompt">
               <button type="button" class="aztec-wear-roll-btn"
                       data-item-uuid="${item.uuid}"
                       data-source-id="${message.id}">
                  <i class="fa-solid ${icon} fa-fw" inert=""></i>
                  <span>${label}</span>
               </button>
            </div>`,
         )

         /* Listener on the button itself, so it is collected along with the
          * message element when the chat log scrolls it away. */
         html
            .querySelector(selector)
            ?.addEventListener("click", onWearButton)
      }
   })

   Hooks.on("createChatMessage", (message) => {
      const applied = message.flags?.[MODULE_ID]?.wearApplied
      if (!applied) return

      const item = fromUuidSync(applied.itemUuid)
      const author = message.author ?? message.user
      if (item && author && !item.testUserPermission(author, "OWNER")) return

      retireWearButton(applied.sourceId, applied.itemUuid)
   })
}

/**
 * Roll the wear die and apply the hit, in one motion.
 *
 * The weapon is re-resolved from its uuid rather than read out of the button,
 * and ownership is checked again, because markup is whatever the person
 * looking at it last typed into their inspector. Neither check is a guarantee
 * — the guarantee is that the server refuses an item update from a user
 * without permission — but they keep an honest table tidy.
 */
async function onWearButton(event) {
   event.preventDefault()
   event.stopPropagation()

   const button = event.currentTarget
   /* Disabled before the first await. The gap to the item update is short but
    * an impatient double click fits inside it, and that would be two hits for
    * one fumble. */
   if (button.disabled) return
   button.disabled = true

   const { itemUuid, sourceId } = button.dataset
   const item = await fromUuid(itemUuid)

   if (!item?.isOwner) {
      button.disabled = false
      return
   }

   /* What is owed is worked out again from the attack, never read out of the
    * button. The markup carries identifiers only; amounts in it would be
    * whatever the person looking at the screen last typed into their
    * inspector. */
   const message = game.messages.get(sourceId)
   const owed = message
      ? getWearPrompts(message).find((entry) => entry.item?.uuid === itemUuid)
      : null

   if (!owed) {
      retireWearButton(sourceId, itemUuid)
      return
   }

   /* Someone got here first — either their card has already arrived, or the
    * item itself remembers this attack. Checking before rolling means no die
    * is thrown for a hit that will not be applied. */
   if (
      findWearCard(sourceId, itemUuid, item) ||
      item.getFlag("world", "lastWearKey") === sourceId
   ) {
      retireWearButton(sourceId, itemUuid)
      return
   }

   let roll = null
   if (owed.rolled) {
      const formula = game.settings.get(MODULE_ID, "wearDamageFormula") || "1d4"
      roll = await new Roll(formula).evaluate()
   }

   const result = await applyWearHit(item, {
      rolled: roll?.total ?? 0,
      flat: owed.flat,
      onceKey: sourceId,
   })
   if (!result) {
      retireWearButton(sourceId, itemUuid)
      return
   }

   const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      flags: {
         [MODULE_ID]: { wearApplied: { sourceId, itemUuid, ...result } },
      },
   }
   const rollMode = game.settings.get("core", "rollMode")

   if (roll) {
      /* Posted through the roll itself so that dice modules animate it and
       * the roll mode is respected. A card built by hand would show the same
       * number with none of that, and wear would feel like the module quietly
       * deciding things on its own. */
      messageData.flavor = buildWearFlavor(item, result)
      await roll.toMessage(messageData, { rollMode })
   } else {
      // A swing with a broken weapon throws no die: there is nothing to
      // animate, so the card is plain content rather than a roll.
      messageData.content = buildWearFlavor(item, result)
      await ChatMessage.create(
         ChatMessage.applyRollMode(messageData, rollMode),
      )
   }
}

/** The lines under the die in the wear card. */
function buildWearFlavor(weapon, result) {
   const line = (key, data) =>
      game.i18n.format(`pf2e-items-sunder-wear.chat.wear.${key}`, data)

   const lines = [`<strong>${line("flavor", { itemName: weapon.name })}</strong>`]

   if (result.flat > 0) lines.push(line("strike-line", { flat: result.flat }))

   /* Only when a die was actually thrown. Rune hardness blunts the die and
    * nothing else, so printing it beside a flat swing cost would misdescribe
    * the rule. */
   if (result.rolled > 0 && result.runeHardness > 0)
      lines.push(line("rune-line", { value: result.runeHardness }))

   lines.push(
      line("hp-line", {
         applied: result.applied,
         hpBefore: result.hpBefore,
         hpAfter: result.hpAfter,
      }),
   )

   if (result.becameDestroyed)
      lines.push(`<strong>${line("destroyed")}</strong>`)
   else if (result.becameBroken) lines.push(`<strong>${line("broken")}</strong>`)

   return lines.join("<br>")
}
