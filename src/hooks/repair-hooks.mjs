/**
 * Field repair, as a conversation in chat.
 *
 * The problem this solves is that repairing someone else's gear needs two
 * permissions nobody holds at once: rolling needs the repairer's character,
 * writing HP needs the item's owner. A single dialog can only ever be one of
 * those people, which is why the module's own repair window silently rolls
 * the item owner's Crafting no matter who is supposed to be doing the work.
 *
 * So it is split across chat cards, and each person acts strictly within
 * their own rights:
 *
 *   1. the owner publishes a request      — repair-app.mjs
 *   2. any character with a repair kit rolls their own Crafting  — here
 *   3. the owner or a GM applies the result                      — step C
 *
 * The request carries the numbers the repairer cannot see for themselves,
 * which also means asking for a repair is exactly as much disclosure as the
 * owner chose to make. Tables that deliberately keep players from browsing
 * each other's gear keep working.
 */

import {
   applyRepair,
   getDegreeOfSuccess,
   getHealBudget,
} from "../repair.mjs"

const MODULE_ID = "pf2e-aztecs-sundered"

/**
 * Find the answer to a repair request, if somebody has already rolled one.
 *
 * Same shape as the wear system's card lookup and for the same reason: a
 * rendered card is inert, so a fresh render has to ask the log whether the
 * button it is about to draw is still live. Walks backwards and stops at the
 * request, since an answer is always newer than the question.
 *
 * Unlike the wear cards there is no author check here. Anyone may answer a
 * repair request — that is the point of it — so there is nobody whose
 * signature could be verified.
 */
function findRepairResult(requestId) {
   const messages = game.messages?.contents ?? []
   for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate.id === requestId) break

      if (candidate.flags?.[MODULE_ID]?.repairResult?.requestId === requestId)
         return candidate
   }
   return null
}

/** Take the repair button off every copy of a request on this screen. */
function retireRepairButton(requestId) {
   document
      .querySelectorAll(`.aztec-repair-btn[data-request-id="${requestId}"]`)
      .forEach((button) =>
         (button.closest(".aztec-wear-prompt") ?? button).remove(),
      )
}

/** Whether a rolled repair has already been applied to the item. */
function findRepairApplied(resultId) {
   const messages = game.messages?.contents ?? []
   for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate.id === resultId) break

      if (candidate.flags?.[MODULE_ID]?.repairApplied?.resultId === resultId)
         return candidate
   }
   return null
}

/** Take the apply button off every copy of a result on this screen. */
function retireApplyButton(resultId) {
   document
      .querySelectorAll(`.aztec-repair-apply-btn[data-result-id="${resultId}"]`)
      .forEach((button) =>
         (button.closest(".aztec-wear-prompt") ?? button).remove(),
      )
}

/**
 * The characters this user could repair with.
 *
 * Owned characters only: rolling someone else's Crafting is not something to
 * do on their behalf. For a GM that is every player character, which is the
 * right list — a GM standing in for an absent player is exactly the case this
 * needs to cover.
 */
function getRepairCandidates() {
   return game.actors.filter(
      (actor) => actor.type === "character" && actor.isOwner,
   )
}

/**
 * Whether a character is carrying something to repair with.
 *
 * RAW wants a repairer's toolkit in hand. The module never checked before,
 * because the old dialog was opened deliberately by someone who had already
 * decided they were repairing; a button in chat that anyone can press needs
 * the check for real.
 */
function hasRepairKit(actor) {
   return actor.items.some((item) => {
      const slug = item.system?.slug ?? ""
      return (
         /repair/i.test(slug) ||
         /repair/i.test(item.name) ||
         /^repairers?-toolkit$/.test(slug)
      )
   })
}

/** Whether this character has a Crafter's Eyepiece invested. */
function hasCraftersEyepiece(actor) {
   return actor.items.some(
      (item) =>
         item.type === "equipment" &&
         item.name.includes("Crafter's Eyepiece") &&
         item.system.equipped?.invested === true,
   )
}

/** Ask which character is doing the work, when there is a choice. */
async function pickRepairer(candidates) {
   if (candidates.length === 1) return candidates[0]

   const options = candidates
      .map((actor) => `<option value="${actor.id}">${actor.name}</option>`)
      .join("")

   const chosen = await foundry.applications.api.DialogV2.prompt({
      window: {
         title: game.i18n.localize(
            "pf2e-aztecs-sundered.dialog.repair.who-repairs",
         ),
      },
      content: `<select name="actorId" style="width: 100%;">${options}</select>`,
      ok: {
         label: game.i18n.localize(
            "pf2e-aztecs-sundered.dialog.repair.roll-crafting",
         ),
         callback: (event, button) => button.form.elements.actorId.value,
      },
      rejectClose: false,
   })

   return chosen ? candidates.find((actor) => actor.id === chosen) : null
}

export function registerRepairHooks() {
   Hooks.on("renderChatMessageHTML", (message, htmlElement) => {
      const request = message.flags?.[MODULE_ID]?.repairRequest
      if (!request || request.townOnly) return
      if (getRepairCandidates().length === 0) return
      if (findRepairResult(message.id)) return

      const html =
         htmlElement instanceof HTMLElement ? htmlElement : htmlElement[0]
      if (!html || html.querySelector(".aztec-repair-btn")) return

      const container = html.querySelector(".card-content") ?? html
      container.insertAdjacentHTML(
         "beforeend",
         `<div class="aztec-wear-prompt">
            <button type="button" class="aztec-repair-btn"
                    data-request-id="${message.id}">
               <i class="fa-solid fa-hammer fa-fw" inert=""></i>
               <span>${game.i18n.localize(
                  "pf2e-aztecs-sundered.chat.repair-request.repair-button",
               )}</span>
            </button>
         </div>`,
      )

      html
         .querySelector(".aztec-repair-btn")
         ?.addEventListener("click", onRepairButton)
   })

   Hooks.on("renderChatMessageHTML", (message, htmlElement) => {
      const result = message.flags?.[MODULE_ID]?.repairResult
      if (!result) return
      if (findRepairApplied(message.id)) return

      /* The other end of the exchange. Rolling belonged to whoever had the
       * Crafting; writing belongs to whoever owns the item, and in Foundry
       * that is the owner and every GM. The repairer, having done the work,
       * usually cannot press this — which is correct, and the reason the
       * whole thing is a conversation rather than one dialog. */
      const item = fromUuidSync(result.itemUuid)
      if (!item?.isOwner) return

      const html =
         htmlElement instanceof HTMLElement ? htmlElement : htmlElement[0]
      if (!html || html.querySelector(".aztec-repair-apply-btn")) return

      const container = html.querySelector(".card-content") ?? html
      container.insertAdjacentHTML(
         "beforeend",
         `<div class="aztec-wear-prompt">
            <button type="button" class="aztec-repair-apply-btn"
                    data-result-id="${message.id}">
               <i class="fa-solid fa-wrench fa-fw" inert=""></i>
               <span>${game.i18n.localize(
                  "pf2e-aztecs-sundered.chat.repair-result.apply-button",
               )}</span>
            </button>
         </div>`,
      )

      html
         .querySelector(".aztec-repair-apply-btn")
         ?.addEventListener("click", onApplyButton)
   })

   Hooks.on("createChatMessage", (message) => {
      const flags = message.flags?.[MODULE_ID]
      if (flags?.repairResult) retireRepairButton(flags.repairResult.requestId)
      if (flags?.repairApplied) retireApplyButton(flags.repairApplied.resultId)
   })
}

/**
 * Roll a character's Crafting against a published repair request.
 *
 * Nothing is written to the item here. The roll belongs to the repairer and
 * the write belongs to the owner, so this ends in a card rather than in a
 * change — which is also what keeps a repairer from needing any permission on
 * gear they do not own.
 */
async function onRepairButton(event) {
   event.preventDefault()
   event.stopPropagation()

   const button = event.currentTarget
   if (button.disabled) return
   button.disabled = true

   const requestId = button.dataset.requestId
   const requestMessage = game.messages.get(requestId)
   const request = requestMessage?.flags?.[MODULE_ID]?.repairRequest

   if (!request || findRepairResult(requestId)) {
      retireRepairButton(requestId)
      return
   }

   const repairer = await pickRepairer(getRepairCandidates())
   if (!repairer) {
      button.disabled = false
      return
   }

   if (!hasRepairKit(repairer)) {
      button.disabled = false
      return ui.notifications.warn(
         game.i18n.format("pf2e-aztecs-sundered.notifications.no-repair-kit", {
            actorName: repairer.name,
         }),
      )
   }

   const crafting = repairer.skills?.crafting
   if (!crafting) {
      button.disabled = false
      return ui.notifications.warn(
         game.i18n.localize(
            "pf2e-aztecs-sundered.notifications.no-crafting-skill",
         ),
      )
   }

   const rank = crafting.rank ?? 0
   const eyepiece = hasCraftersEyepiece(repairer)

   crafting.roll({
      dc: { value: request.dc },
      event,
      callback: async (roll, outcome) => {
         const resolved =
            outcome ??
            getDegreeOfSuccess(
               roll.total,
               request.dc,
               roll.dice?.[0]?.results?.find((r) => r.active)?.result ?? null,
            )
         const healBudget = getHealBudget(resolved, rank, eyepiece)

         const line = (key, data) =>
            game.i18n.format(
               `pf2e-aztecs-sundered.chat.repair-result.${key}`,
               data,
            )
         /* With full repair on, the budget stops being the promise — one
          * success takes the item to its limit — so the card must not quote
          * a number it will not honour. */
         const fullRepair =
            game.settings.get(MODULE_ID, "wearFullRepair") && healBudget > 0

         const lines = [
            `<strong>${line("header", {
               actorName: repairer.name,
               itemName: request.itemName ?? "",
            })}</strong>`,
            line(`outcome-${resolved}${fullRepair ? "-full" : ""}`, {
               healBudget,
            }),
         ]

         /* The same roll mode as the check it summarises. Without this a
          * blind or whispered Crafting roll would hide the dice and then
          * announce the outcome to the whole table anyway. */
         const messageData = {
            speaker: ChatMessage.getSpeaker({ actor: repairer }),
            content: `<div class="pf2e chat-card"><div class="card-content">${lines.join("<br>")}</div></div>`,
            flags: {
               [MODULE_ID]: {
                  repairResult: {
                     requestId,
                     itemUuid: request.itemUuid,
                     outcome: resolved,
                     /* The budget travels with the card because the person
                      * who applies it cannot see the repairer's sheet. What
                      * does NOT travel is the item's state: that is read
                      * fresh when the repair lands, or a sword damaged in the
                      * meantime would be healed from a stale number. */
                     healBudget,
                     itemName: request.itemName ?? "",
                     repairerName: repairer.name,
                  },
               },
            },
         }

         await ChatMessage.create(
            ChatMessage.applyRollMode(
               messageData,
               game.settings.get("core", "rollMode"),
            ),
         )
      },
   })
}

/** Minutes as something a person would say out loud. */
function formatDuration(minutes) {
   const hours = Math.floor(minutes / 60)
   const rest = minutes % 60

   if (hours === 0)
      return game.i18n.format("pf2e-aztecs-sundered.time.minutes", { minutes })
   if (rest === 0)
      return game.i18n.format("pf2e-aztecs-sundered.time.hours", { hours })

   return game.i18n.format("pf2e-aztecs-sundered.time.hours-minutes", {
      hours,
      minutes: rest,
   })
}

/**
 * Apply a rolled repair to the item.
 *
 * The last step of the exchange, and the only one that writes anything. The
 * budget comes off the card; everything about the item's condition is read
 * fresh, because the roll and this click are separated by however long it
 * took someone to notice the card.
 */
async function onApplyButton(event) {
   event.preventDefault()
   event.stopPropagation()

   const button = event.currentTarget
   if (button.disabled) return
   button.disabled = true

   const resultId = button.dataset.resultId
   const resultMessage = game.messages.get(resultId)
   const result = resultMessage?.flags?.[MODULE_ID]?.repairResult

   if (!result || findRepairApplied(resultId)) {
      retireApplyButton(resultId)
      return
   }

   const item = await fromUuid(result.itemUuid)
   if (!item?.isOwner) {
      button.disabled = false
      return
   }

   /* The fractional part of a limit loss is a chance, not a rounding. Rolled
    * here rather than inside the rules so the rules stay testable, and rolled
    * openly through Foundry's dice rather than Math.random so a table that
    * wants to watch it can. */
   const percentRoll = (await new Roll("1d100").evaluate()).total

   /* A botched repair spoils the item on the same die as a fumbled swing, so
    * it reads the same setting: raise wear to a d6 and a ruined repair
    * follows it. */
   let critFailRoll = 0
   if (result.outcome === "criticalFailure") {
      const formula =
         game.settings.get(MODULE_ID, "wearDamageFormula") || "1d4"
      critFailRoll = (await new Roll(formula).evaluate()).total
   }

   const applied = await applyRepair(item, {
      healBudget: result.healBudget,
      outcome: result.outcome,
      percentRoll,
      critFailRoll,
      onceKey: resultId,
   })
   if (!applied) {
      retireApplyButton(resultId)
      return
   }

   const line = (key, data) =>
      game.i18n.format(`pf2e-aztecs-sundered.chat.repair-applied.${key}`, data)

   const lines = [
      `<strong>${line("header", { itemName: item.name })}</strong>`,
      /* The limit first, because it moved first and because it is the number
       * nobody would otherwise notice. Hit points come back; this does not. */
      applied.limitLost > 0
         ? line("limit-lost", {
              limitBefore: applied.limitBefore,
              limitAfter: applied.limitAfter,
              limitLost: applied.limitLost,
           })
         : line("limit-kept", { limitAfter: applied.limitAfter }),
      applied.critDamage > 0
         ? line("crit-damage", { critDamage: applied.critDamage })
         : null,
      applied.restored > 0
         ? line("restored", {
              restored: applied.restored,
              hpBefore: applied.hpBefore,
              hpAfter: applied.hpAfter,
           })
         : line("nothing", {
              hpBefore: applied.hpBefore,
              hpAfter: applied.hpAfter,
           }),
      applied.destroyed ? `<strong>${line("destroyed")}</strong>` : null,
      /* The duration only. There was one attempt — one click, one check — and
       * the multiplier behind the number is bookkeeping, not events at the
       * table. Time matters more than the HP line in a roguelike delve: ten
       * minutes of camp is ten minutes something else could find them. */
      line("time", { duration: formatDuration(applied.minutes) }),
   ].filter(Boolean)

   await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      content: `<div class="pf2e chat-card"><div class="card-content">${lines.join("<br>")}</div></div>`,
      flags: {
         [MODULE_ID]: {
            repairApplied: {
               resultId,
               itemUuid: result.itemUuid,
               restored: applied.restored,
               hpBefore: applied.hpBefore,
               hpAfter: applied.hpAfter,
            },
         },
      },
   })
}
