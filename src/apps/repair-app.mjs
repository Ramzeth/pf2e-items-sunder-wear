const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
import { getDefaultDurability } from "../logic.mjs"
import { getRepairLimit, getWearBase, getWearProfile } from "../wear.mjs"
import { getDegreeOfSuccess, getHealingValues } from "../repair.mjs"

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
      window: { title: "pf2e-aztecs-sundered.sheet-text.repair-item" },
      actions: {
         repair: this._onRepair,
         requestRepair: this._onRequestRepair,
      },
   }

   static PARTS = {
      main: {
         template: "modules/pf2e-aztecs-sundered/templates/repair-dialog.hbs",
      },
   }

   _getHealingValues(rank) {
      return getHealingValues(rank, this.hasCraftersEyepiece)
   }

   async _prepareContext(options) {
      if (!this.actor) {
         ui.notifications.warn(
            game.i18n.localize(
               "pf2e-aztecs-sundered.notifications.no-actor-repair",
            ),
         )
         return this.close()
      }
      if (!this.actor.skills?.crafting) {
         ui.notifications.warn(
            game.i18n.localize(
               "pf2e-aztecs-sundered.notifications.no-crafting-skill",
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
               "pf2e-aztecs-sundered.notifications.fully-repaired",
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
         game.i18n.localize("pf2e-aztecs-sundered.ranks.untrained") ||
            "Untrained",
         game.i18n.localize("pf2e-aztecs-sundered.ranks.trained") || "Trained",
         game.i18n.localize("pf2e-aztecs-sundered.ranks.expert") || "Expert",
         game.i18n.localize("pf2e-aztecs-sundered.ranks.master") || "Master",
         game.i18n.localize("pf2e-aztecs-sundered.ranks.legendary") ||
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

      this.itemBaseHardness = isShieldItem
         ? (this.item.system.hardness ?? 0)
         : (this.item.getFlag("world", "hardness") ??
           this.materialDefaults.hardness)
      this.currentHitPoints = currentHitPoints
      this.repairLimit = repairLimit

      let { baseHeal, critHeal } = this._getHealingValues(baseCraftingRank)

      let restoresInfo = game.i18n.format(
         "pf2e-aztecs-sundered.dialog.repair.restores-info",
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

   _onRender(context, options) {
      super._onRender(context, options)
      const el = this.element

      const rankSelect = el.querySelector("#repair-rank")
      const infoSpan = el.querySelector("#repair-restores-info")

      rankSelect.addEventListener("change", () => {
         let selectedRank = parseInt(rankSelect.value) || 0
         let { baseHeal, critHeal } = this._getHealingValues(selectedRank)

         let updatedInfo = game.i18n.format(
            "pf2e-aztecs-sundered.dialog.repair.restores-info",
            { baseHeal, critHeal },
         )
         if (updatedInfo.includes("dialog.repair.restores-info"))
            updatedInfo = `(Default success restores ${baseHeal} HP. Crit restores ${critHeal} HP)`
         infoSpan.textContent = updatedInfo
      })
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
         game.i18n.format(`pf2e-aztecs-sundered.chat.repair-request.${key}`, data)

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
            "pf2e-aztecs-sundered": {
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
               },
            },
         },
      })

      this.close()
   }

   static async _onRepair(event, target) {
      const el = this.element
      let finalDifficultyClass =
         parseInt(el.querySelector("#repair-dc").value) || 15
      let selectedRank = parseInt(el.querySelector("#repair-rank").value) || 0

      let { baseHeal, critHeal } = this._getHealingValues(selectedRank)

      this.actor.skills.crafting.roll({
         dc: { value: finalDifficultyClass },
         event: event,
         callback: async (rollResult, outcomeType) => {
            outcomeType ??= getDegreeOfSuccess(
               rollResult.total,
               finalDifficultyClass,
               rollResult.terms?.[0]?.results?.[0]?.result ?? null,
            )

            let amountHealed = 0
            if (outcomeType === "criticalSuccess") amountHealed = critHeal
            else if (outcomeType === "success") amountHealed = baseHeal
            else if (outcomeType === "criticalFailure") {
               let critFailRoll = await new Roll("2d6").evaluate()
               let damage = Math.max(
                  0,
                  critFailRoll.total - this.itemBaseHardness,
               )
               amountHealed = -damage
            }

            let newlyCalculatedHitPoints =
               amountHealed > 0
                  ? Math.min(
                       this.repairLimit,
                       this.currentHitPoints + amountHealed,
                    )
                  : Math.max(0, this.currentHitPoints + amountHealed)

            let isShieldItem = this.item.type === "shield"
            let targetItemUpdates = {}

            if (isShieldItem)
               targetItemUpdates["system.hp.value"] = newlyCalculatedHitPoints
            else {
               targetItemUpdates["flags.world.currentHp"] =
                  newlyCalculatedHitPoints
               /* First time anything writes durability to this item: give it
                * the numbers its material says it should have. This used to
                * store a hardcoded hardness of 5 and whatever maximum the
                * window happened to be showing, which quietly turned every
                * repaired-but-untracked item into the same generic object. */
               if (this.item.getFlag("world", "maxHp") === undefined) {
                  targetItemUpdates["flags.world.maxHp"] =
                     this.materialDefaults.maxHp
                  targetItemUpdates["flags.world.hardness"] =
                     this.materialDefaults.hardness
               }
            }
            await this.item.update(targetItemUpdates)

            let outcomeColor =
               outcomeType === "criticalSuccess"
                  ? "green"
                  : outcomeType === "success"
                    ? "blue"
                    : outcomeType === "criticalFailure"
                      ? "red"
                      : "gray"
            let outcomeTextMap = {
               criticalSuccess:
                  game.i18n.localize(
                     "pf2e-aztecs-sundered.outcomes.critical-success",
                  ) || "Critical Success",
               success:
                  game.i18n.localize("pf2e-aztecs-sundered.outcomes.success") ||
                  "Success",
               failure:
                  game.i18n.localize("pf2e-aztecs-sundered.outcomes.failure") ||
                  "Failure",
               criticalFailure:
                  game.i18n.localize(
                     "pf2e-aztecs-sundered.outcomes.critical-failure",
                  ) || "Critical Failure",
            }
            let rolledFallback =
               game.i18n.localize("pf2e-aztecs-sundered.outcomes.rolled") ||
               "Rolled"

            let titleBase = game.i18n.format(
               "pf2e-aztecs-sundered.chat.repair.header",
               { itemName: this.item.name },
            )
            if (titleBase.includes("chat.repair.header"))
               titleBase = `Repairing ${this.item.name}`

            let amountText =
               amountHealed !== 0
                  ? game.i18n.format(
                       amountHealed > 0
                          ? "pf2e-aztecs-sundered.chat.repair.healed"
                          : "pf2e-aztecs-sundered.chat.repair.damaged",
                       {
                          amount: Math.abs(
                             newlyCalculatedHitPoints - this.currentHitPoints,
                          ),
                       },
                    )
                  : game.i18n.localize(
                       "pf2e-aztecs-sundered.chat.repair.no-hp-restored",
                    ) || "No HP restored"

            if (amountText.includes("chat.repair")) {
               amountText =
                  amountHealed > 0
                     ? `Restored ${Math.abs(newlyCalculatedHitPoints - this.currentHitPoints)} HP`
                     : `Damaged ${Math.abs(newlyCalculatedHitPoints - this.currentHitPoints)} HP`
            }

            let currentHpLabel =
               game.i18n.localize(
                  "pf2e-aztecs-sundered.chat.repair.current-hp",
               ) || "Current HP"

            ChatMessage.create({
               user: game.user.id,
               speaker: ChatMessage.getSpeaker({ actor: this.actor || null }),
               content: `<div class=\"pf2e chat-card\"><header class=\"card-header flexrow\"><img src=\"${this.item.img}\" title=\"${this.item.name}\" width=\"36\" height=\"36\"/><h3>${titleBase}</h3></header><div class=\"card-content\" style=\"margin-top: 5px;\"><div style=\"color: ${outcomeColor}; font-weight: bold; font-size: 1.1em; text-align: center; margin: 4px 0;\">${outcomeTextMap[outcomeType] || rolledFallback}</div><div>${amountText}</div><div style=\"text-align: center; margin-top: 5px;\">${currentHpLabel}: <strong>${newlyCalculatedHitPoints} / ${this.repairLimit}</strong></div></div></div>`,
            })
         },
      })
      this.close()
   }
}
