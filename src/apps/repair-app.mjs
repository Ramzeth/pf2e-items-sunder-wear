const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
import { getDefaultDurability } from "../logic.mjs"
import { getRepairLimit, getWearBase, getWearProfile } from "../wear.mjs"
import {
   applyRepair,
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
   tierOptionsHtml,
} from "./repair-forecast.mjs"

export class RepairApp extends HandlebarsApplicationMixin(ApplicationV2) {
   constructor(options = {}) {
      super(options)
      this.item = options.item
      this.actor = this.item?.actor
   }

   static DEFAULT_OPTIONS = {
      id: "repair-app",
      classes: ["pf2e"],
      position: { width: 400, height: "auto" },
      window: { title: "pf2e-items-sunder-wear.sheet-text.repair-item" },
      actions: {
         repair: this._onRepair,
         requestRepair: this._onRequestRepair,
      },
   }

   static PARTS = {
      main: {
         template: "modules/pf2e-items-sunder-wear/templates/repair-dialog.hbs",
      },
   }

   _getHealingValues(rank) {
      return getHealingValues(rank, this.hasCraftersEyepiece)
   }

   async _prepareContext(options) {
      if (!this.actor) {
         ui.notifications.warn(
            game.i18n.localize(
               "pf2e-items-sunder-wear.notifications.no-actor-repair",
            ),
         )
         return this.close()
      }
      if (!this.actor.skills?.crafting) {
         ui.notifications.warn(
            game.i18n.localize(
               "pf2e-items-sunder-wear.notifications.no-crafting-skill",
            ),
         )
         return this.close()
      }

      let isShieldItem = this.item.type === "shield"

      /* An item nobody has edited yet has no durability flags, and its real
       * numbers come from its material — not from a flat 10/5. */
      this.materialDefaults = getDefaultDurability(this.item)

      let currentHitPoints = isShieldItem
         ? (this.item.system.hp?.value ?? 0)
         : (this.item.getFlag("world", "currentHp") ??
           this.materialDefaults.maxHp)

      /* Repair tops out at the repair limit, never at the base. This is the
       * single most important line in the file for the wear system: healing
       * up to the base instead would cancel every point of fatigue the item
       * has ever accumulated, and nothing would ever wear out. */
      let repairLimit =
         getRepairLimit(this.item) ?? this.materialDefaults.maxHp

      if (currentHitPoints >= repairLimit) {
         ui.notifications.info(
            game.i18n.localize(
               "pf2e-items-sunder-wear.notifications.fully-repaired",
            ) || "This item is already at maximum HP.",
         )
         return this.close()
      }

      let baseCraftingRank = this.actor.skills.crafting.rank ?? 0
      let repairDifficultyClass = 15

      this.hasCraftersEyepiece = this.actor.items.some(
         (i) =>
            i.type === "equipment" &&
            i.name.includes("Crafter's Eyepiece") &&
            i.system.equipped?.invested === true,
      )

      const rankNames = [
         game.i18n.localize("pf2e-items-sunder-wear.ranks.untrained") ||
            "Untrained",
         game.i18n.localize("pf2e-items-sunder-wear.ranks.trained") || "Trained",
         game.i18n.localize("pf2e-items-sunder-wear.ranks.expert") || "Expert",
         game.i18n.localize("pf2e-items-sunder-wear.ranks.master") || "Master",
         game.i18n.localize("pf2e-items-sunder-wear.ranks.legendary") ||
            "Legendary",
      ]

      let ranks = rankNames.map((label, index) => ({
         value: index,
         label: label,
         selected: index === baseCraftingRank,
      }))

      if (this.item.system.level?.value !== undefined) {
         const standardDifficultyClasses = [
            14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35,
            36, 38, 39, 40, 42, 44, 46, 48, 50,
         ]
         repairDifficultyClass =
            standardDifficultyClasses[
               Math.max(0, Math.min(25, this.item.system.level.value))
            ]
      }

      this.currentHitPoints = currentHitPoints
      this.repairLimit = repairLimit

      /* The forecast needs the item's fatigue profile and its untouched base:
       * the profile to price a grade, the base to draw the bar against
       * something that never moves. An item outside the wear system has no
       * profile, and the forecast degrades to a plain DC line. */
      this.wearProfile = getWearProfile(this.item)
      this.wearBase = getWearBase(this.item) ?? this.materialDefaults.maxHp

      let { baseHeal, critHeal } = this._getHealingValues(baseCraftingRank)

      let restoresInfo = game.i18n.format(
         "pf2e-items-sunder-wear.dialog.repair.restores-info",
         { baseHeal, critHeal },
      )
      if (restoresInfo.includes("dialog.repair.restores-info")) {
         restoresInfo = `(Default success restores ${baseHeal} HP. Crit restores ${critHeal} HP)`
      }

      return {
         item: this.item,
         ranks: ranks,
         dc: repairDifficultyClass,
         restoresInfo: restoresInfo,
         currentHp: currentHitPoints,
         repairLimit,
      }
   }

   /**
    * Keep the window honest as the three inputs move.
    *
    * Proficiency, grade and DC all feed the same forecast, so there is one
    * redraw rather than three listeners each patching their own corner. The
    * grade list is rebuilt only when proficiency changes, because rebuilding
    * a dropdown out from under somebody who is using it is rude — and because
    * dropping a rank can invalidate the grade they had chosen, which is the
    * one case where the list has to move.
    */
   _onRender(context, options) {
      super._onRender(context, options)
      const el = this.element

      const rankSelect = el.querySelector("#repair-rank")
      const tierSelect = el.querySelector("#repair-tier")
      const dcInput = el.querySelector("#repair-dc")
      const infoSpan = el.querySelector("#repair-restores-info")
      const forecast = el.querySelector("#repair-forecast")

      const refresh = (rebuildTiers = false) => {
         const rank = parseInt(rankSelect.value) || 0
         const { baseHeal, critHeal } = this._getHealingValues(rank)

         if (rebuildTiers) {
            /* Hold on to the chosen grade where the new proficiency still
             * allows it, and slide down to the finest they can manage where
             * it does not. */
            const wanted = parseInt(tierSelect.value) || ROUGH_TIER
            const highest = getSelectableTiers(rank).at(-1).index
            tierSelect.innerHTML = tierOptionsHtml(
               this.wearProfile,
               rank,
               Math.min(wanted, highest),
            )
         }

         let updatedInfo = game.i18n.format(
            "pf2e-items-sunder-wear.dialog.repair.restores-info",
            { baseHeal, critHeal },
         )
         if (updatedInfo.includes("dialog.repair.restores-info"))
            updatedInfo = `(Default success restores ${baseHeal} HP. Crit restores ${critHeal} HP)`
         infoSpan.textContent = updatedInfo

         forecast.innerHTML = forecastHtml({
            profile: this.wearProfile,
            base: this.wearBase,
            repairLimit: this.repairLimit,
            currentHp: this.currentHitPoints,
            baseDc: parseInt(dcInput.value) || 15,
            tierIndex: parseInt(tierSelect.value) || ROUGH_TIER,
            baseHeal,
            critHeal,
            fullRepair: game.settings.get(
               "pf2e-items-sunder-wear",
               "wearFullRepair",
            ),
         })
      }

      rankSelect.addEventListener("change", () => refresh(true))
      tierSelect.addEventListener("change", () => refresh())
      dcInput.addEventListener("input", () => refresh())

      refresh(true)
   }

   /**
    * Publish the item to chat as needing repair, for somebody else to fix.
    *
    * The other button in this window repairs an item with its own owner's
    * Crafting, which only works when the person holding the item is also the
    * person who can fix it. In a party that is the exception: the smith is
    * usually not the one carrying the broken sword.
    *
    * Splitting it into a chat exchange is what resolves that, because the two
    * halves need different permissions and nobody holds both. Rolling needs
    * the repairer's character; writing HP needs the item's owner. Each side
    * acts entirely within their own rights, and the card carries what the
    * other side cannot see.
    *
    * That last part is also why the numbers are pushed into the card rather
    * than read off the item later: a table may deliberately keep players from
    * browsing each other's gear, and asking for a repair is then exactly as
    * much disclosure as the owner chose to make.
    */
   static async _onRequestRepair(event, target) {
      const el = this.element
      const dc = parseInt(el.querySelector("#repair-dc")?.value) || 15

      const profile = getWearProfile(this.item)
      const base = getWearBase(this.item) ?? this.repairLimit

      /* Field repair has a floor: once the repair limit has eroded to within
       * a point of the broken threshold there is nothing left to give up for
       * it, and only a town forge will do. The check lives here so the
       * request never goes out with an offer nobody can honour. */
      const townOnly = profile ? profile.bt > this.repairLimit - 1 : false

      const line = (key, data) =>
         game.i18n.format(`pf2e-items-sunder-wear.chat.repair-request.${key}`, data)

      const lines = [
         `<strong>${line("header", { itemName: this.item.name })}</strong>`,
         line("difficulty", {
            level: this.item.system.level?.value ?? 0,
            dc,
         }),
         line("state", {
            currentHp: this.currentHitPoints,
            repairLimit: this.repairLimit,
            base,
         }),
      ]
      if (townOnly) lines.push(`<strong>${line("town-only")}</strong>`)

      await ChatMessage.create({
         speaker: ChatMessage.getSpeaker({ actor: this.actor }),
         content: `<div class="pf2e chat-card"><header class="card-header flexrow"><img src="${this.item.img}" width="36" height="36"></header><div class="card-content">${lines.join("<br>")}</div></div>`,
         flags: {
            "pf2e-items-sunder-wear": {
               repairRequest: {
                  itemUuid: this.item.uuid,
                  itemName: this.item.name,
                  dc,
                  townOnly,
                  /* Snapshot for the repairer to read, never for applying:
                   * the sword can take another hit before anyone gets to it,
                   * and healing it from a stale number would resurrect HP. */
                  currentHp: this.currentHitPoints,
                  repairLimit: this.repairLimit,
                  base,
                  /* The two numbers that price a repair. They travel because
                   * the repairer cannot read the item — that is the whole
                   * point of the exchange — and without them their window
                   * could not tell them what a grade would cost. */
                  mod: profile?.mod ?? 0,
                  bt: profile?.bt ?? 0,
               },
            },
         },
      })

      this.close()
   }

   /**
    * Repair the item with its own owner's Crafting.
    *
    * This used to be a system of its own: it healed a flat number of hit
    * points, never touched the repair limit, and rolled 2d6 against Hardness
    * on a critical failure. An item mended here therefore aged differently
    * from the same item mended through a chat request — the wear system simply
    * did not apply to work you did on your own gear, which is the opposite of
    * what anyone would assume.
    *
    * It now ends in applyRepair() like every other path, so the rules are the
    * rules whoever holds the file.
    */
   static async _onRepair(event, target) {
      const el = this.element
      const baseDc = parseInt(el.querySelector("#repair-dc").value) || 15
      const rank = parseInt(el.querySelector("#repair-rank").value) || 0
      const tierIndex =
         parseInt(el.querySelector("#repair-tier").value) || ROUGH_TIER
      const dc = baseDc + (REPAIR_TIERS[tierIndex]?.dc ?? 0)

      /* First time anything writes durability to this item, give it the
       * numbers its material says it should have. This used to store a
       * hardcoded hardness of 5 and whatever maximum the window happened to be
       * showing, which quietly turned every repaired-but-untracked item into
       * the same generic object. */
      if (
         this.item.type !== "shield" &&
         this.item.getFlag("world", "maxHp") === undefined
      )
         await this.item.update({
            "flags.world.maxHp": this.materialDefaults.maxHp,
            "flags.world.hardness": this.materialDefaults.hardness,
         })

      this.actor.skills.crafting.roll({
         dc: { value: dc },
         event: event,
         callback: async (rollResult, outcomeType) => {
            outcomeType ??= getDegreeOfSuccess(
               rollResult.total,
               dc,
               rollResult.dice?.[0]?.results?.find((r) => r.active)?.result ??
                  null,
            )

            /* The fraction of a limit loss is a chance, not a rounding, and it
             * is rolled through Foundry rather than Math.random so a table
             * that wants to watch it can. */
            const percentRoll = (await new Roll("1d100").evaluate()).total

            const applied = await applyRepair(this.item, {
               healBudget: getHealBudget(
                  outcomeType,
                  rank,
                  this.hasCraftersEyepiece,
               ),
               outcome: outcomeType,
               percentRoll,
               tierIndex,
            })
            if (!applied) return this.close()

            const outcomeColor =
               outcomeType === "criticalSuccess"
                  ? "green"
                  : outcomeType === "success"
                    ? "blue"
                    : outcomeType === "criticalFailure"
                      ? "red"
                      : "gray"

            const outcomeName = game.i18n.localize(
               `pf2e-items-sunder-wear.outcomes.${outcomeType
                  .replace(/([A-Z])/g, "-$1")
                  .toLowerCase()}`,
            )

            await ChatMessage.create({
               user: game.user.id,
               speaker: ChatMessage.getSpeaker({ actor: this.actor || null }),
               content: `<div class="pf2e chat-card"><header class="card-header flexrow"><img src="${
                  this.item.img
               }" title="${this.item.name}" width="36" height="36"/></header>
                  <div class="card-content" style="margin-top: 5px;">
                     <div style="color: ${outcomeColor}; font-weight: bold; text-align: center; margin: 4px 0;">${outcomeName}</div>
                     ${repairAppliedLines(applied, this.item.name).join("<br>")}
                  </div>
               </div>`,
            })
         },
      })
      this.close()
   }
}
