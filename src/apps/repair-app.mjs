const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
import { getDefaultDurability } from "../logic.mjs"
import { getRepairLimit, getWearBase, getWearProfile } from "../wear.mjs"
import {
   applyRepair,
   clampTierToRank,
   getDegreeOfSuccess,
   getHealBudget,
   getHealingValues,
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

   /**
    * The rough-work DC this repair is rated against.
    *
    * For a player it is always the one computed from the item's level, never
    * anything read off the page: hiding the field is presentation, and a page
    * can be edited. Only a GM's field is trusted, because overriding the DC
    * is a GM's call to make — and an empty or broken entry falls back to the
    * computed value rather than to some arbitrary number.
    */
   _readBaseDc() {
      if (!game.user.isGM) return this.baseDc

      const typed = parseInt(this.element?.querySelector("#repair-dc")?.value)
      return Number.isInteger(typed) ? typed : this.baseDc
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

      /* The repairer is whoever is holding the item, and their Crafting is
       * whatever their sheet says. This used to be a dropdown of all five
       * ranks, pre-selected to the character's own — which let a player hand
       * themselves legendary Crafting and buy Flawless work with it. Reading
       * the rank instead of offering it is the whole point of the grade
       * ladder: fine work is what proficiency is for. */
      this.craftingRank = this.actor.skills.crafting.rank ?? 0
      let repairDifficultyClass = 15

      this.hasCraftersEyepiece = this.actor.items.some(
         (i) =>
            i.type === "equipment" &&
            i.name.includes("Crafter's Eyepiece") &&
            i.system.equipped?.invested === true,
      )

      const RANK_KEYS = ["untrained", "trained", "expert", "master", "legendary"]
      const rankName = game.i18n.localize(
         `pf2e-items-sunder-wear.ranks.${RANK_KEYS[this.craftingRank] ?? "untrained"}`,
      )

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
      this.baseDc = repairDifficultyClass

      /* The forecast needs the item's fatigue profile and its untouched base:
       * the profile to price a grade, the base to draw the bar against
       * something that never moves. An item outside the wear system has no
       * profile, and the forecast degrades to a plain DC line. */
      this.wearProfile = getWearProfile(this.item)
      this.wearBase = getWearBase(this.item) ?? this.materialDefaults.maxHp

      let { baseHeal, critHeal } = this._getHealingValues(this.craftingRank)

      let restoresInfo = game.i18n.format(
         "pf2e-items-sunder-wear.dialog.repair.restores-info",
         { baseHeal, critHeal },
      )
      if (restoresInfo.includes("dialog.repair.restores-info")) {
         restoresInfo = `(Default success restores ${baseHeal} HP. Crit restores ${critHeal} HP)`
      }

      return {
         item: this.item,
         repairerLine: game.i18n.format(
            "pf2e-items-sunder-wear.dialog.repair.repairer-line",
            { actorName: this.actor.name, rank: rankName },
         ),
         dc: repairDifficultyClass,
         /* Only the GM gets a field. The DC is the item's, set by its level,
          * and a player who could type their own would never fail a repair. */
         dcEditable: game.user.isGM,
         restoresInfo: restoresInfo,
         currentHp: currentHitPoints,
         repairLimit,
      }
   }

   /**
    * Keep the window honest as the two inputs move.
    *
    * Only the grade and the DC are inputs now. Proficiency used to be a third,
    * and the grade list had to be rebuilt whenever it changed; with the rank
    * read off the sheet the list is built once and never moves, which is also
    * what makes this window match the one a repairer gets in chat.
    *
    * The DC is an input for the GM only. An item's level sets it, and a table
    * that wants a different number should be able to say so without
    * recomputing the grade premium by hand — but that is the GM's call. A
    * player sees the DC as plain text, and only the grade moves for them.
    */
   _onRender(context, options) {
      super._onRender(context, options)
      const el = this.element

      const tierSelect = el.querySelector("#repair-tier")
      const dcInput = el.querySelector("#repair-dc")
      const forecast = el.querySelector("#repair-forecast")

      const { baseHeal, critHeal } = this._getHealingValues(this.craftingRank)

      tierSelect.innerHTML = tierOptionsHtml(
         this.wearProfile,
         this.craftingRank,
         ROUGH_TIER,
      )

      const refresh = () => {
         forecast.innerHTML = forecastHtml({
            profile: this.wearProfile,
            base: this.wearBase,
            repairLimit: this.repairLimit,
            currentHp: this.currentHitPoints,
            baseDc: this._readBaseDc(),
            tierIndex: parseInt(tierSelect.value) || ROUGH_TIER,
            baseHeal,
            critHeal,
            fullRepair: game.settings.get(
               "pf2e-items-sunder-wear",
               "wearFullRepair",
            ),
         })
      }

      tierSelect.addEventListener("change", refresh)
      // Absent for players: they see the DC as text, not as a field.
      dcInput?.addEventListener("input", refresh)

      refresh()
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
      /* The DC published on the card is the one every repairer will roll
       * against, so it has to be the item's, not whatever an owner typed. */
      const dc = this._readBaseDc()

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
      const baseDc = this._readBaseDc()
      const rank = this.craftingRank

      const tierIndex = clampTierToRank(
         parseInt(el.querySelector("#repair-tier").value),
         rank,
      )
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
