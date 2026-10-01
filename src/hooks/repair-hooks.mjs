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
   clampTierToRank,
   getDegreeOfSuccess,
   getHealBudget,
   getHealingValues,
   getSelectableTiers,
   REPAIR_TIERS,
   ROUGH_TIER,
} from "../repair.mjs"
import {
   forecastHtml,
   repairAppliedLines,
   tierName,
   tierOptionsHtml,
} from "../apps/repair-forecast.mjs"

const MODULE_ID = "pf2e-items-sunder-wear"

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

/**
 * Whether this character has a Crafter's Eyepiece invested.
 *
 * Tolerates no character at all: the repair dialog prices its forecast while
 * the actor dropdown is still settling, and a missing actor there means "no
 * eyepiece", not a crash.
 */
function hasCraftersEyepiece(actor) {
   return Boolean(
      actor?.items?.some(
         (item) =>
            item.type === "equipment" &&
            item.name.includes("Crafter's Eyepiece") &&
            item.system.equipped?.invested === true,
      ),
   )
}

/**
 * Ask who is doing the work and how finely, and show them what it will cost.
 *
 * One window rather than two. The grade has to be chosen by the repairer,
 * because which grades exist at all depends on their Crafting — the owner who
 * published the request has no way to know that, and no business deciding it.
 * And since the forecast is priced off whoever is holding the file, the two
 * questions cannot be asked separately without asking the second one twice.
 *
 * It opens even when there is only one candidate, where the old character
 * picker used to skip straight to the roll. Skipping is right for a question
 * with one answer; it is wrong for a question with five.
 *
 * @returns {Promise<{repairer: Actor, tierIndex: number}|null>}
 */
async function openRepairDialog(candidates, request) {
   if (!candidates.length) {
      ui.notifications.warn(
         game.i18n.localize(
            "pf2e-items-sunder-wear.notifications.no-crafting-skill",
         ),
      )
      return null
   }

   /* Everything the forecast needs comes off the card, and the item is never
    * touched. A repairer has no right to read gear they do not own — a table
    * may deliberately keep players out of each other's packs — so the owner
    * put these numbers on the card when they asked for help, and asking is
    * exactly as much disclosure as they chose to make.
    *
    * That makes the forecast a forecast: the snapshot can be minutes old and
    * the blade may have taken another hit since. The real numbers are read
    * fresh when the repair is applied, which is the only place they matter. */
   const base = request.base ?? request.repairLimit ?? 0
   const repairLimit = request.repairLimit ?? base
   const currentHp = request.currentHp ?? repairLimit
   const profile =
      request.mod > 0
         ? { mod: request.mod, bt: request.bt ?? 0, base }
         : null
   const fullRepair = game.settings.get(MODULE_ID, "wearFullRepair")

   const actorOptions = candidates
      .map((actor) => `<option value="${actor.id}">${actor.name}</option>`)
      .join("")

   const label = (key) =>
      game.i18n.localize(`pf2e-items-sunder-wear.dialog.repair.${key}`)

   const content = `
      <div class="form-group">
         <label>${label("who-repairs")}</label>
         <select name="actorId" style="width: 100%;">${actorOptions}</select>
      </div>
      <div class="form-group">
         <label>${label("grade")}</label>
         <select name="tierIndex" style="width: 100%;"></select>
      </div>
      <div data-forecast></div>`

   const chosen = await foundry.applications.api.DialogV2.prompt({
      window: { title: label("who-repairs") },
      content,
      ok: {
         label: label("roll-crafting"),
         callback: (event, button) => ({
            actorId: button.form.elements.actorId.value,
            tierIndex: parseInt(button.form.elements.tierIndex.value),
         }),
      },
      rejectClose: false,
      render: (event, dialog) => {
         const root = dialog.element ?? dialog
         const actorSelect = root.querySelector("[name=actorId]")
         const tierSelect = root.querySelector("[name=tierIndex]")
         const forecast = root.querySelector("[data-forecast]")

         const refresh = (rebuildTiers = false) => {
            const repairer = candidates.find(
               (actor) => actor.id === actorSelect.value,
            )
            const rank = repairer?.skills?.crafting?.rank ?? 0
            const { baseHeal, critHeal } = getHealingValues(
               rank,
               hasCraftersEyepiece(repairer),
            )

            if (rebuildTiers) {
               const wanted = parseInt(tierSelect.value) || ROUGH_TIER
               const highest = getSelectableTiers(rank).at(-1).index
               tierSelect.innerHTML = tierOptionsHtml(
                  profile,
                  rank,
                  Math.min(wanted, highest),
               )
            }

            forecast.innerHTML = forecastHtml({
               profile,
               base,
               repairLimit,
               currentHp,
               baseDc: request.dc,
               tierIndex: parseInt(tierSelect.value) || ROUGH_TIER,
               baseHeal,
               critHeal,
               fullRepair,
            })
         }

         actorSelect.addEventListener("change", () => refresh(true))
         tierSelect.addEventListener("change", () => refresh())
         refresh(true)
      },
   })

   if (!chosen) return null

   const repairer = candidates.find((actor) => actor.id === chosen.actorId)
   return repairer ? { repairer, tierIndex: chosen.tierIndex } : null
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
                  "pf2e-items-sunder-wear.chat.repair-request.repair-button",
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
                  "pf2e-items-sunder-wear.chat.repair-result.apply-button",
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

   const chosen = await openRepairDialog(getRepairCandidates(), request)
   if (!chosen) {
      button.disabled = false
      return
   }

   const { repairer } = chosen

   if (!hasRepairKit(repairer)) {
      button.disabled = false
      return ui.notifications.warn(
         game.i18n.format("pf2e-items-sunder-wear.notifications.no-repair-kit", {
            actorName: repairer.name,
         }),
      )
   }

   const crafting = repairer.skills?.crafting
   if (!crafting) {
      button.disabled = false
      return ui.notifications.warn(
         game.i18n.localize(
            "pf2e-items-sunder-wear.notifications.no-crafting-skill",
         ),
      )
   }

   const rank = crafting.rank ?? 0
   const eyepiece = hasCraftersEyepiece(repairer)

   const tierIndex = clampTierToRank(chosen.tierIndex, rank)

   /* The published DC is for rough work. Finer work is the same job done more
    * carefully, and the premium for that is what makes the grade a choice
    * rather than a free upgrade. */
   const dc = request.dc + (REPAIR_TIERS[tierIndex]?.dc ?? 0)

   crafting.roll({
      dc: { value: dc },
      event,
      callback: async (roll, outcome) => {
         const resolved =
            outcome ??
            getDegreeOfSuccess(
               roll.total,
               dc,
               roll.dice?.[0]?.results?.find((r) => r.active)?.result ?? null,
            )
         const healBudget = getHealBudget(resolved, rank, eyepiece)

         const line = (key, data) =>
            game.i18n.format(
               `pf2e-items-sunder-wear.chat.repair-result.${key}`,
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
            /* The grade and the DC it actually cost, because the request card
             * above it advertises the rough-work DC and would otherwise make
             * this roll look like a different check against the wrong number. */
            line("grade", { grade: tierName(tierIndex), dc }),
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
                     /* So the owner applies the grade that was actually
                      * rolled, not whatever the default happens to be. */
                     tierIndex,
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

   /* A botched repair costs a flat point, so there is nothing to roll for it
    * here. It deliberately does not follow the wear die setting: raising
    * combat wear to a d6 makes fights harsher, not the workbench. */
   const applied = await applyRepair(item, {
      healBudget: result.healBudget,
      outcome: result.outcome,
      percentRoll,
      /* The grade the repairer actually rolled at, off the card. Falling back
       * to rough work would silently apply a different — and always harsher —
       * repair than the one on screen. */
      tierIndex: result.tierIndex ?? ROUGH_TIER,
      onceKey: resultId,
   })
   if (!applied) {
      retireApplyButton(resultId)
      return
   }

   const lines = repairAppliedLines(applied, item.name)

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
