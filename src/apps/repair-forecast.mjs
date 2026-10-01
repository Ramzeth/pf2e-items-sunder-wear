/**
 * Everything the repair system says out loud: the grade picker, the forecast
 * behind it, and the card that reports what a repair actually did.
 *
 * Two windows need the picker — the owner's repair window and the dialog a
 * repairer gets when answering a request in chat — and both paths end in the
 * same card. They are different applications with different permissions, and
 * the only thing they share is the wording, so the wording lives here rather
 * than being written twice and drifting apart.
 *
 * Everything below is a string builder over numbers it is handed. Nothing
 * reads an item, nothing writes one, and nothing knows which window it is
 * drawing into.
 */

import {
   REPAIR_TIERS,
   getSelectableTiers,
   isTierProductive,
   previewRepair,
} from "../repair.mjs"

const MODULE_ID = "pf2e-items-sunder-wear"

const label = (key, data) =>
   data
      ? game.i18n.format(`${MODULE_ID}.${key}`, data)
      : game.i18n.localize(`${MODULE_ID}.${key}`)

/** A grade's name, as the table says it. */
export function tierName(tierIndex) {
   const tier = REPAIR_TIERS[tierIndex]
   return tier ? label(`tiers.${tier.key}`) : ""
}

/**
 * The options for the grade dropdown.
 *
 * Grades that cannot return anything on this item are listed and marked, not
 * hidden. Hiding them would hide the rule they exist to teach — that an
 * orichalcum blade is beyond rough work and always will be — and would leave a
 * player wondering why their dropdown is shorter than someone else's.
 *
 * @param {object|null} profile   the item's wear profile, or null if it has none.
 * @param {number} rank           the repairer's Crafting proficiency.
 * @param {number} selected       the grade to mark as chosen.
 * @returns {string}
 */
export function tierOptionsHtml(profile, rank, selected) {
   return getSelectableTiers(rank)
      .map((tier) => {
         const dead = !isTierProductive(profile, tier.index)
         const name = label(`tiers.${tier.key}`)
         const suffix = dead ? ` — ${label("dialog.repair.tier-dead-short")}` : ""

         return `<option value="${tier.index}"${
            tier.index === selected ? " selected" : ""
         }>${name} (DC +${tier.dc})${suffix}</option>`
      })
      .join("")
}

/** A limit loss as a person would read it: whole where it is whole. */
const formatLoss = (loss) =>
   Number.isInteger(loss) ? String(loss) : loss.toFixed(2).replace(/\.?0+$/, "")

/**
 * A bar of the item's base, with everything that matters marked on it.
 *
 * Reading from the back forward: the whole track is the base the item left the
 * forge with, the grey band is the repair limit this repair would spend, the
 * light green band is the hit points it would give back, the solid green is
 * what the item has now, and the tick is the broken threshold. Whatever is
 * left of the bare track past the grey was spent by earlier repairs.
 *
 * The gains are green and the cost is grey on purpose. The restored band used
 * to be amber, and amber reads as a warning — it put the alarm on the one part
 * of the picture that is good news, while the actual cost sat in a neutral
 * colour beside it.
 *
 * The legend carries the numbers, each beside a swatch of its band, so the bar
 * can be read without counting pixels and the numbers without a key.
 *
 * On an item too fine for the grade chosen, the solid green runs past the
 * grey's start and there is no light green at all. That looks wrong because
 * it is: the repair would return nothing.
 */
function limitBarHtml({
   base,
   repairLimit,
   limitAfter,
   currentHp,
   restored,
   limitLoss,
   bt,
}) {
   if (!(base > 0)) return ""

   const percent = (value) =>
      `${Math.max(0, Math.min(100, (value / base) * 100)).toFixed(1)}%`

   const key = (swatch, text) =>
      `<span class="aztec-limit-key"><i class="aztec-swatch ${swatch}"></i>${text}</span>`

   return `<div class="aztec-limit-bar" role="img" aria-label="${label(
      "dialog.repair.bar-label",
   )}">
      <div class="aztec-limit-bar-track">
         <div class="aztec-limit-bar-limit" style="width:${percent(repairLimit)}"></div>
         <div class="aztec-limit-bar-after" style="width:${percent(limitAfter)}"></div>
         <div class="aztec-limit-bar-hp" style="width:${percent(currentHp)}"></div>
         <div class="aztec-limit-bar-bt" style="left:${percent(bt)}"></div>
      </div>
      <div class="aztec-limit-bar-legend">
         ${key("aztec-swatch-hp", label("dialog.repair.bar-hp", { value: currentHp }))}
         ${key(
            "aztec-swatch-restored",
            label("dialog.repair.bar-restored", {
               value: restored > 0 ? `+${restored}` : "0",
            }),
         )}
         ${key(
            "aztec-swatch-lost",
            label("dialog.repair.bar-lost", {
               value: limitLoss > 0 ? `−${formatLoss(limitLoss)}` : "0",
            }),
         )}
         ${key("aztec-swatch-bt", label("dialog.repair.bar-bt", { value: bt }))}
         ${key("aztec-swatch-base", label("dialog.repair.bar-base", { value: base }))}
      </div>
   </div>`
}

/**
 * The whole forecast: the check to beat, what each outcome does, and the bar.
 *
 * Outcomes are listed separately rather than averaged. An average would hide
 * the thing being weighed — that a grade is nearly free when it goes well and
 * dear when it does not — behind a number that never actually happens.
 *
 * @param {object} input  everything previewRepair() needs, plus `base` for the
 *   bar and `rank` for nothing at all — the caller has already turned rank
 *   into budgets.
 * @returns {string}
 */
export function forecastHtml({
   profile,
   base,
   repairLimit,
   currentHp,
   baseDc,
   tierIndex,
   baseHeal = 0,
   critHeal = 0,
   fullRepair = false,
}) {
   const preview = previewRepair({
      profile,
      repairLimit,
      currentHp,
      baseDc,
      tierIndex,
      baseHeal,
      critHeal,
      fullRepair,
   })

   const row = (outcome) => {
      const forecast = preview.outcomes[outcome]
      const shifted = forecast.tierIndex !== preview.tierIndex

      /* The loss and the limit it leaves get a column each. Together in one
       * cell ("−3.3 → 16") the eye lands on the arrow's end and skips the
       * cost — and the cost is the number this table exists to show. */
      return `<tr class="aztec-forecast-${outcome}">
         <th>${label(
            `outcomes.${outcome.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
         )}${shifted ? ` <em>(${tierName(forecast.tierIndex)})</em>` : ""}</th>
         <td>${forecast.limitLoss > 0 ? `−${formatLoss(forecast.limitLoss)}` : "—"}</td>
         <td>${Math.floor(forecast.limitAfter)}</td>
         <td>${
            forecast.damage > 0
               ? label("dialog.repair.hp-damage", { value: forecast.damage })
               : forecast.restored > 0
                 ? `+${forecast.restored}`
                 : "—"
         }</td>
      </tr>`
   }

   /* Everything below the check line describes a success, so the bar is drawn
    * for a success: the outcome a player is picking a grade in the hope of. */
   const onSuccess = preview.outcomes.success

   return `<div class="aztec-repair-forecast">
      <div class="aztec-forecast-dc">${label("dialog.repair.final-dc", {
         dc: preview.dc,
      })}</div>
      ${
         preview.productive
            ? ""
            : `<div class="aztec-forecast-warning">${label(
                 "dialog.repair.tier-dead",
              )}</div>`
      }
      <table class="aztec-forecast-table">
         <thead><tr>
            <th></th>
            <th>${label("dialog.repair.col-loss")}</th>
            <th>${label("dialog.repair.col-limit")}</th>
            <th>${label("dialog.repair.col-hp")}</th>
         </tr></thead>
         <tbody>
            ${["criticalSuccess", "success", "failure", "criticalFailure"]
               .map(row)
               .join("")}
         </tbody>
      </table>
      ${limitBarHtml({
         base,
         repairLimit,
         limitAfter: onSuccess.limitAfter,
         currentHp,
         restored: onSuccess.restored,
         limitLoss: onSuccess.limitLoss,
         bt: profile?.bt ?? 0,
      })}
   </div>`
}

/**
 * Minutes as something a person would say out loud.
 *
 * Rounded to the whole minute, and never to nothing: time is linear now, so a
 * repair that returned a single hit point really did take under a minute, and
 * "0 min" would read as though no time passed at all. At the table the answer
 * to "how long?" is never zero.
 */
export function formatDuration(minutes) {
   const total = Math.max(1, Math.round(minutes))
   const hours = Math.floor(total / 60)
   const rest = total % 60

   if (hours === 0) return label("time.minutes", { minutes: total })
   if (rest === 0) return label("time.hours", { hours })

   return label("time.hours-minutes", { hours, minutes: rest })
}

/**
 * The card that reports a finished repair, as lines to be joined.
 *
 * Both halves of the system end here — the owner repairing their own gear and
 * the owner applying somebody else's roll — so the table reads the same report
 * either way.
 *
 * @param {object} applied  what applyRepair() returned.
 * @param {string} itemName
 * @returns {string[]}
 */
export function repairAppliedLines(applied, itemName) {
   const line = (key, data) => label(`chat.repair-applied.${key}`, data)

   return [
      `<strong>${line("header", { itemName })}</strong>`,
      /* The grade, and when a critical moved it, both grades. Somebody reading
       * the card later has no other way to know an expert's careful work came
       * out as a bodge because they rolled a one. */
      applied.deliveredTier === applied.attemptedTier
         ? line("grade", { grade: tierName(applied.attemptedTier) })
         : line("grade-shifted", {
              attempted: tierName(applied.attemptedTier),
              delivered: tierName(applied.deliveredTier),
           }),
      /* The limit next, because it moved first and because it is the number
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
       * the arithmetic behind the number is bookkeeping, not events at the
       * table. Time matters more than the HP line in a roguelike delve: ten
       * minutes of camp is ten minutes something else could find them. */
      line("time", { duration: formatDuration(applied.minutes) }),
   ].filter(Boolean)
}
