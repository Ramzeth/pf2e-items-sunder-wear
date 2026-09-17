const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
import { materialStats } from "../constants.mjs"
import { getDefaultDurability } from "../logic.mjs"
import {
   getBrokenThreshold,
   getRepairLimit,
   getWearBase,
   getWearProfile,
} from "../wear.mjs"

export class DurabilityApp extends HandlebarsApplicationMixin(ApplicationV2) {
   constructor(options = {}) {
      super(options)
      this.item = options.item
      this.updateHookId = Hooks.on("updateItem", (item) => {
         if (item.id === this.item.id) this.render()
      })
   }

   async close(options) {
      Hooks.off("updateItem", this.updateHookId)
      return super.close(options)
   }

   static DEFAULT_OPTIONS = {
      id: "durability-config-app",
      classes: ["pf2e"],
      position: { width: 350, height: "auto" },
      window: { title: "pf2e-aztecs-sundered.dialog.durability.config-title" },
      actions: {
         save: this._onSave,
         repair: this._onRepair,
         sunder: this._onSunder,
      },
   }

   static PARTS = {
      main: {
         template:
            "modules/pf2e-aztecs-sundered/templates/durability-dialog.hbs",
      },
   }

   async _prepareContext(options) {
      const isShieldItem = this.item.type === "shield"
      const isDefaultType =
         this.item.type === "armor" ||
         this.item.type === "weapon" ||
         isShieldItem
      const hasDurabilityFlags =
         this.item.getFlag("world", "maxHp") !== undefined
      const isTracked = isDefaultType || hasDurabilityFlags

      /* An item nobody has edited yet carries no durability flags at all, and
       * its real numbers come from its material. Falling back to a flat 10/5
       * here, as this window used to, meant it showed a longsword as 10/10
       * while the inventory row showed 20/20 — and saving that view wrote the
       * lie into the item. */
      const materialDefaults = getDefaultDurability(this.item)

      let currentHp = isShieldItem
         ? (this.item.system.hp?.value ?? 0)
         : (this.item.getFlag("world", "currentHp") ?? materialDefaults.maxHp)
      let hardness = isShieldItem
         ? (this.item.system.hardness ?? 0)
         : (this.item.getFlag("world", "hardness") ?? materialDefaults.hardness)
      let assignedMaterial =
         this.item.getFlag("world", "assignedMaterial") || ""

      /* The second box of the HP row is the repair limit. Outside the wear
       * system that is the same number as the base, which is why the window
       * looked like it had a single maximum before this system existed — and
       * why the base gets a row of its own only when the two can differ. */
      const wearProfile = getWearProfile(this.item)
      const base = isShieldItem
         ? (this.item.system.hp?.max ?? 0)
         : getWearBase(this.item)
      const repairLimit = getRepairLimit(this.item) ?? base

      // Kept on the instance so the live preview below can recompute the
      // threshold as the GM types, using the same percentage the rules use.
      this.wearBtPercent = wearProfile?.btPercent ?? null

      let materialOptions = Object.entries(materialStats).map(
         ([keyName, values]) => ({
            key: keyName,
            name: game.i18n.localize(
               `pf2e-aztecs-sundered.material-stats.${keyName}.name`,
            ),
            selected: keyName === assignedMaterial,
         }),
      )

      const pf2eConfig = CONFIG.PF2E || {}

      const getLocalizedOptions = (configObj) => {
         if (!configObj) return []
         return Object.entries(configObj)
            .map(([key, locKey]) => ({
               key,
               label: game.i18n.localize(locKey),
            }))
            .sort((a, b) => a.label.localeCompare(b.label))
      }

      let immunityOptions = getLocalizedOptions(pf2eConfig.immunityTypes)
      let weaknessOptions = getLocalizedOptions(pf2eConfig.weaknessTypes)
      let resistanceOptions = getLocalizedOptions(pf2eConfig.resistanceTypes)

      let storedImmunities = this.item.getFlag("world", "immunities") || []
      let storedWeaknesses = this.item.getFlag("world", "weaknesses") || []
      let storedResistances = this.item.getFlag("world", "resistances") || []

      let immunities = storedImmunities.map((i) => ({
         type: i,
         label: game.i18n.localize(pf2eConfig.immunityTypes?.[i] || i),
      }))
      let weaknesses = storedWeaknesses.map((w) => ({
         type: w.type,
         value: w.value,
         label: game.i18n.localize(
            pf2eConfig.weaknessTypes?.[w.type] || w.type,
         ),
      }))
      let resistances = storedResistances.map((r) => ({
         type: r.type,
         value: r.value,
         label: game.i18n.localize(
            pf2eConfig.resistanceTypes?.[r.type] || r.type,
         ),
      }))

      this.options.window.title = `Durability: ${this.item.name}`

      return {
         currentHp,
         repairLimit,
         hardness,
         base,
         showBase: !!wearProfile,
         bt: getBrokenThreshold(this.item, base),
         materialOptions,
         isTracked,
         immunityOptions,
         weaknessOptions,
         resistanceOptions,
         immunities,
         weaknesses,
         resistances,
      }
   }

   _onRender(context, options) {
      super._onRender(context, options)
      const el = this.element

      if (!el.querySelector(".durability-save-btn")) {
         const btn = document.createElement("button")
         btn.type = "button"
         btn.className = "durability-save-btn"
         btn.style.marginTop = "10px"
         btn.dataset.action = "save"
         btn.innerHTML = `<i class="fa-solid fa-save"></i> ${game.i18n.localize("pf2e-aztecs-sundered.dialog.durability.save")}`
         el.querySelector(".aztec-durability-summary")?.appendChild(btn) ||
            el.appendChild(btn)
      }

      const currHpInput = el.querySelector("#dur-curr-hp")
      const baseInput = el.querySelector("#dur-base")
      const repairLimitInput = el.querySelector("#dur-repair-limit")
      const hdInput = el.querySelector("#dur-hd")
      const btSpan = el.querySelector("#dur-bt")
      const matSelect = el.querySelector("#dur-mat-select")

      /* One formula, no branches: the threshold is a share of the base, and
       * the share is 50% for an item the system does not govern. The repair
       * limit does not enter into it at all. */
      const refreshThresholdPreview = () => {
         if (!btSpan || !baseInput) return

         let base = parseInt(baseInput.value) || 0
         let percent = this.wearBtPercent ?? 50
         btSpan.textContent = Math.floor((base * percent) / 100)
      }

      baseInput?.addEventListener("input", refreshThresholdPreview)

      matSelect?.addEventListener("change", () => {
         let selectedMat = materialStats[matSelect.value]
         if (selectedMat) {
            /* Picking a material remakes the item, so everything lands on the
             * new material's full value: base, repair limit and current HP.
             * Current HP used to be scaled proportionally here; it no longer
             * is, to match what the material hook does on save. The two
             * disagreeing would mean the window showed one number and the
             * item ended up with another. */
            let newBase = selectedMat.hp

            if (baseInput) baseInput.value = newBase
            if (repairLimitInput) repairLimitInput.value = newBase
            if (currHpInput) currHpInput.value = newBase
            if (hdInput) hdInput.value = selectedMat.hd
            refreshThresholdPreview()
         }
      })

      const setupIWRSelect = (selectId, listId, rowClass, hasValue) => {
         const select = el.querySelector(`#${selectId}`)
         const list = el.querySelector(`#${listId}`)
         if (!select || !list) return

         select.addEventListener("change", () => {
            let type = select.value
            if (!type) return

            if (list.querySelector(`.${rowClass}[data-type="${type}"]`)) {
               select.value = ""
               return ui.notifications.warn(
                  game.i18n.localize(
                     "pf2e-aztecs-sundered.notifications.trait-assigned",
                  ),
               )
            }

            let label = select.options[select.selectedIndex].text
            let row = document.createElement("div")
            row.className = `iwr-row ${rowClass}`
            row.dataset.type = type
            row.style.cssText =
               "display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 3px; font-size: 0.9em;"

            if (hasValue) {
               row.innerHTML = `<span>${label}</span><span style="display: flex; align-items: center; gap: 6px;"><input type="number" class="iwr-value" value="5" style="width: 45px; height: 22px; text-align: center;"><a class="remove-iwr" style="color: #d9534f; cursor: pointer;"><i class="fa-solid fa-trash"></i></a></span>`
            } else {
               row.innerHTML = `<span>${label}</span><a class="remove-iwr" style="color: #d9534f; cursor: pointer;"><i class="fa-solid fa-trash"></i></a>`
            }

            row.querySelector(".remove-iwr")?.addEventListener("click", () =>
               row.remove(),
            )
            list.appendChild(row)
            select.value = ""
         })
      }

      setupIWRSelect(
         "dur-add-immunity",
         "dur-immunities-list",
         "immunity-row",
         false,
      )
      setupIWRSelect(
         "dur-add-weakness",
         "dur-weaknesses-list",
         "weakness-row",
         true,
      )
      setupIWRSelect(
         "dur-add-resistance",
         "dur-resistances-list",
         "resistance-row",
         true,
      )

      el.querySelectorAll(".remove-iwr").forEach((btn) =>
         btn.addEventListener("click", (e) =>
            e.currentTarget.closest(".iwr-row").remove(),
         ),
      )
   }

   static async _onSave(event, target) {
      const el = this.element
      const isShieldItem = this.item.type === "shield"
      let newCurrentHp = parseInt(el.querySelector("#dur-curr-hp")?.value) || 0
      let newBase = parseInt(el.querySelector("#dur-base")?.value) || 0
      let newHardness = parseInt(el.querySelector("#dur-hd")?.value) || 0
      let newMat = el.querySelector("#dur-mat-select")?.value
      let repairLimitInput = el.querySelector("#dur-repair-limit")

      let immunities = []
      el.querySelectorAll(".immunity-row").forEach((row) =>
         immunities.push(row.dataset.type),
      )

      let weaknesses = []
      el.querySelectorAll(".weakness-row").forEach((row) => {
         weaknesses.push({
            type: row.dataset.type,
            value: parseInt(row.querySelector(".iwr-value")?.value) || 0,
         })
      })

      let resistances = []
      el.querySelectorAll(".resistance-row").forEach((row) => {
         resistances.push({
            type: row.dataset.type,
            value: parseInt(row.querySelector(".iwr-value")?.value) || 0,
         })
      })

      let updates = {
         "flags.world.immunities": immunities,
         "flags.world.weaknesses": weaknesses,
         "flags.world.resistances": resistances,
      }

      if (isShieldItem) {
         updates["system.hp.value"] = newCurrentHp
         updates["system.hp.max"] = newBase
         updates["system.hardness"] = newHardness
      } else {
         updates["flags.world.currentHp"] = newCurrentHp
         updates["flags.world.maxHp"] = newBase
         updates["flags.world.hardness"] = newHardness

         /* The repair limit field exists only while the system governs this
          * item. A limit at or above the base is the same thing as no limit,
          * so it clears the flag instead of storing a duplicate of the base.
          *
          * Neither number is clamped against the other. A GM lowering the
          * base below a tired item's limit is making a deliberate statement —
          * this sword is worse than it was built to be — and the rules cope:
          * setRepairLimit() never raises a limit, so the item erodes down to
          * the new base and stays there. */
         if (repairLimitInput) {
            let newRepairLimit = parseInt(repairLimitInput.value) || 0
            if (newRepairLimit >= newBase)
               updates["flags.world.-=repairLimit"] = null
            else updates["flags.world.repairLimit"] = newRepairLimit
         }
      }

      if (newMat) {
         updates["flags.world.assignedMaterial"] = newMat
         await this.item.update(updates)
      } else {
         await this.item.update(updates)
         if (this.item.getFlag("world", "assignedMaterial") !== undefined) {
            await this.item.unsetFlag("world", "assignedMaterial")
         }
      }
      this.close()
   }

   static async _onRepair(event, target) {
      const { RepairApp } = await import("./repair-app.mjs")
      new RepairApp({ item: this.item }).render(true)
   }

   static async _onSunder(event, target) {
      const { SunderApp } = await import("./sunder-app.mjs")
      new SunderApp({
         actor: this.item.actor,
         attackerData: { rawDamage: 0, parsedDamage: [] },
         preselectedItemId: this.item.id,
      }).render(true)
   }
}
