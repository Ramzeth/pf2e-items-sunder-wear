import { getBrokenThreshold } from "./wear.mjs"

const forceStateSync = foundry.utils.debounce(async () => {
   const updates = []
   for (let actor of game.actors) {
      for (let item of actor.items) {
         if (item.type === "armor" || item.type === "weapon") {
            let maxHp = item.getFlag("world", "maxHp")
            let currentHp = item.getFlag("world", "currentHp")
            if (maxHp && currentHp <= getBrokenThreshold(item, maxHp)) {
               updates.push(
                  item.update({ "flags.world.durabilitySync": Date.now() }),
               )
            }
         }
      }
   }
   await Promise.all(updates)
}, 500)

export const registerSettings = () => {
   game.settings.register("pf2e-items-sunder-wear", "showInventoryUI", {
      name: "pf2e-items-sunder-wear.settings.showInventoryUI.name",
      hint: "pf2e-items-sunder-wear.settings.showInventoryUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "showInventoryUI_players", {
      name: "pf2e-items-sunder-wear.settings.showForPlayers.name",
      hint: "pf2e-items-sunder-wear.settings.showForPlayers.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "showDamageButtonUI", {
      name: "pf2e-items-sunder-wear.settings.showDamageButtonUI.name",
      hint: "pf2e-items-sunder-wear.settings.showDamageButtonUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register(
      "pf2e-items-sunder-wear",
      "showDamageButtonUI_players",
      {
         name: "pf2e-items-sunder-wear.settings.showForPlayers.name",
         hint: "pf2e-items-sunder-wear.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: true,
         requiresReload: true,
      },
   )

   game.settings.register(
      "pf2e-items-sunder-wear",
      "showTrackDurabilityButtonUI",
      {
         name: "pf2e-items-sunder-wear.settings.showTrackDurabilityButtonUI.name",
         hint: "pf2e-items-sunder-wear.settings.showTrackDurabilityButtonUI.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: false,
         requiresReload: true,
      },
   )

   game.settings.register(
      "pf2e-items-sunder-wear",
      "showTrackDurabilityButtonUI_players",
      {
         name: "pf2e-items-sunder-wear.settings.showForPlayers.name",
         hint: "pf2e-items-sunder-wear.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: false,
         requiresReload: true,
      },
   )

   game.settings.register("pf2e-items-sunder-wear", "showRepairButtonUI", {
      name: "pf2e-items-sunder-wear.settings.showRepairButtonUI.name",
      hint: "pf2e-items-sunder-wear.settings.showRepairButtonUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register(
      "pf2e-items-sunder-wear",
      "showRepairButtonUI_players",
      {
         name: "pf2e-items-sunder-wear.settings.showForPlayers.name",
         hint: "pf2e-items-sunder-wear.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: true,
         requiresReload: true,
      },
   )

   game.settings.register("pf2e-items-sunder-wear", "enableArmourPenalty", {
      name: "pf2e-items-sunder-wear.settings.enableArmourPenalty.name",
      hint: "pf2e-items-sunder-wear.settings.enableArmourPenalty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "armourPenaltyLight", {
      name: "pf2e-items-sunder-wear.settings.armourPenaltyLight.name",
      hint: "pf2e-items-sunder-wear.settings.armourPenaltyLight.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -1,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "armourPenaltyMedium", {
      name: "pf2e-items-sunder-wear.settings.armourPenaltyMedium.name",
      hint: "pf2e-items-sunder-wear.settings.armourPenaltyMedium.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -2,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "armourPenaltyHeavy", {
      name: "pf2e-items-sunder-wear.settings.armourPenaltyHeavy.name",
      hint: "pf2e-items-sunder-wear.settings.armourPenaltyHeavy.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -3,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "laminarPenaltyReduction", {
      name: "pf2e-items-sunder-wear.settings.laminarPenaltyReduction.name",
      hint: "pf2e-items-sunder-wear.settings.laminarPenaltyReduction.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -1,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "enableWeaponPenalty", {
      name: "pf2e-items-sunder-wear.settings.enableWeaponPenalty.name",
      hint: "pf2e-items-sunder-wear.settings.enableWeaponPenalty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "weaponPenaltyAmount", {
      name: "pf2e-items-sunder-wear.settings.weaponPenaltyAmount.name",
      hint: "pf2e-items-sunder-wear.settings.weaponPenaltyAmount.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -2,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressArmourPotency", {
      name: "pf2e-items-sunder-wear.settings.suppressArmourPotency.name",
      hint: "pf2e-items-sunder-wear.settings.suppressArmourPotency.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressArmourResilient", {
      name: "pf2e-items-sunder-wear.settings.suppressArmourResilient.name",
      hint: "pf2e-items-sunder-wear.settings.suppressArmourResilient.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressArmourProperty", {
      name: "pf2e-items-sunder-wear.settings.suppressArmourProperty.name",
      hint: "pf2e-items-sunder-wear.settings.suppressArmourProperty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressWeaponPotency", {
      name: "pf2e-items-sunder-wear.settings.suppressWeaponPotency.name",
      hint: "pf2e-items-sunder-wear.settings.suppressWeaponPotency.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressWeaponStriking", {
      name: "pf2e-items-sunder-wear.settings.suppressWeaponStriking.name",
      hint: "pf2e-items-sunder-wear.settings.suppressWeaponStriking.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "suppressWeaponProperty", {
      name: "pf2e-items-sunder-wear.settings.suppressWeaponProperty.name",
      hint: "pf2e-items-sunder-wear.settings.suppressWeaponProperty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-items-sunder-wear", "restrictPreciousMaterial", {
      name: "pf2e-items-sunder-wear.settings.restrictPreciousMaterial.name",
      hint: "pf2e-items-sunder-wear.settings.restrictPreciousMaterial.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })

   game.settings.register("pf2e-items-sunder-wear", "injectSunderButton", {
      name: "pf2e-items-sunder-wear.settings.injectSunderButton.name",
      hint: "pf2e-items-sunder-wear.settings.injectSunderButton.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "allowPlayersSunderButton", {
      name: "pf2e-items-sunder-wear.settings.allowPlayersSunderButton.name",
      hint: "pf2e-items-sunder-wear.settings.allowPlayersSunderButton.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })

   /* -----------------------------------------------------------------------
    * Wear & Tear (homebrew attrition system)
    *
    * Master switch defaults to OFF: the system rewrites how items break and
    * how Repair behaves, so an existing world must opt in deliberately.
    * Every sub-setting is read live by getWearProfile() in wear.mjs, so no
    * reload is required — the next trigger simply uses the new numbers.
    * -------------------------------------------------------------------- */

   game.settings.register("pf2e-items-sunder-wear", "enableWearSystem", {
      name: "pf2e-items-sunder-wear.settings.enableWearSystem.name",
      hint: "pf2e-items-sunder-wear.settings.enableWearSystem.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })

   game.settings.register("pf2e-items-sunder-wear", "enableWeaponWear", {
      name: "pf2e-items-sunder-wear.settings.enableWeaponWear.name",
      hint: "pf2e-items-sunder-wear.settings.enableWeaponWear.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "enableArmourWear", {
      name: "pf2e-items-sunder-wear.settings.enableArmourWear.name",
      hint: "pf2e-items-sunder-wear.settings.enableArmourWear.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearFullRepair", {
      name: "pf2e-items-sunder-wear.settings.wearFullRepair.name",
      hint: "pf2e-items-sunder-wear.settings.wearFullRepair.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearDamageFormula", {
      name: "pf2e-items-sunder-wear.settings.wearDamageFormula.name",
      hint: "pf2e-items-sunder-wear.settings.wearDamageFormula.hint",
      scope: "world",
      config: true,
      type: String,
      default: "1d4",
   })

   game.settings.register("pf2e-items-sunder-wear", "wearBrokenStrikeCost", {
      name: "pf2e-items-sunder-wear.settings.wearBrokenStrikeCost.name",
      hint: "pf2e-items-sunder-wear.settings.wearBrokenStrikeCost.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearWeaponDivisor", {
      name: "pf2e-items-sunder-wear.settings.wearWeaponDivisor.name",
      hint: "pf2e-items-sunder-wear.settings.wearWeaponDivisor.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 40,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearArmourDivisor", {
      name: "pf2e-items-sunder-wear.settings.wearArmourDivisor.name",
      hint: "pf2e-items-sunder-wear.settings.wearArmourDivisor.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 80,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearWeaponBtPercent", {
      name: "pf2e-items-sunder-wear.settings.wearWeaponBtPercent.name",
      hint: "pf2e-items-sunder-wear.settings.wearWeaponBtPercent.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 25,
   })

   game.settings.register("pf2e-items-sunder-wear", "wearArmourBtPercent", {
      name: "pf2e-items-sunder-wear.settings.wearArmourBtPercent.name",
      hint: "pf2e-items-sunder-wear.settings.wearArmourBtPercent.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 50,
   })
}

Hooks.on("renderSettingsConfig", (app, htmlData) => {
   const html = htmlData instanceof HTMLElement ? htmlData : htmlData[0]

   const toggleUIDependencies = () => {
      const showInventoryUI = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showInventoryUI"]',
      )
      const showInventoryUIPlayers = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showInventoryUI_players"]',
      )

      const showDamageUI = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showDamageButtonUI"]',
      )
      const showDamageUIPlayers = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showDamageButtonUI_players"]',
      )

      const showTrackUI = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showTrackDurabilityButtonUI"]',
      )
      const showTrackUIPlayers = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showTrackDurabilityButtonUI_players"]',
      )

      const showRepairUI = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showRepairButtonUI"]',
      )
      const showRepairUIPlayers = html.querySelector(
         'input[name="pf2e-items-sunder-wear.showRepairButtonUI_players"]',
      )

      if (!showInventoryUI) return

      const setDisplay = (element, isVisible) => {
         if (element && element.closest(".form-group")) {
            element.closest(".form-group").style.display = isVisible
               ? ""
               : "none"
         }
      }

      let isMainOn = showInventoryUI.checked

      setDisplay(showInventoryUIPlayers, isMainOn)

      showDamageUI.disabled = !isMainOn
      showTrackUI.disabled = !isMainOn
      showRepairUI.disabled = !isMainOn

      setDisplay(showDamageUIPlayers, isMainOn && showDamageUI.checked)
      setDisplay(showTrackUIPlayers, isMainOn && showTrackUI.checked)
      setDisplay(showRepairUIPlayers, isMainOn && showRepairUI.checked)
   }

   const toggleDependencies = () => {
      const armourPotency = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressArmourPotency"]',
      )
      const armourResilient = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressArmourResilient"]',
      )
      const armourProperty = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressArmourProperty"]',
      )

      if (armourPotency && armourResilient && armourProperty) {
         if (armourPotency.checked) {
            armourResilient.disabled = true
            armourResilient.checked = false
            armourProperty.disabled = true
            armourProperty.checked = false
         } else {
            armourResilient.disabled = false
            armourProperty.disabled = false
         }
      }

      const weaponPotency = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressWeaponPotency"]',
      )
      const weaponStriking = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressWeaponStriking"]',
      )
      const weaponProperty = html.querySelector(
         'input[name="pf2e-items-sunder-wear.suppressWeaponProperty"]',
      )

      if (weaponPotency && weaponStriking && weaponProperty) {
         if (weaponPotency.checked) {
            weaponStriking.disabled = true
            weaponStriking.checked = false
            weaponProperty.disabled = true
            weaponProperty.checked = false
         } else {
            weaponStriking.disabled = false
            weaponProperty.disabled = false
         }
      }
   }

   // Wear settings are meaningless while the master switch is off, so the
   // whole block is hidden rather than merely disabled — it keeps the
   // settings sheet short for tables that never enable the system.
   const toggleWearDependencies = () => {
      const master = html.querySelector(
         'input[name="pf2e-items-sunder-wear.enableWearSystem"]',
      )
      if (!master) return

      const dependants = [
         "enableWeaponWear",
         "enableArmourWear",
         "wearFullRepair",
         "wearDamageFormula",
         "wearBrokenStrikeCost",
         "wearWeaponDivisor",
         "wearArmourDivisor",
         "wearWeaponBtPercent",
         "wearArmourBtPercent",
      ]

      dependants.forEach((key) => {
         const input = html.querySelector(
            `[name="pf2e-items-sunder-wear.${key}"]`,
         )
         const group = input?.closest(".form-group")
         if (group) group.style.display = master.checked ? "" : "none"
      })
   }

   toggleUIDependencies()
   toggleDependencies()
   toggleWearDependencies()

   html.addEventListener("change", (e) => {
      if (e.target.name === "pf2e-items-sunder-wear.enableWearSystem") {
         toggleWearDependencies()
      } else if (e.target.name.startsWith("pf2e-items-sunder-wear.show")) {
         toggleUIDependencies()
      } else if (
         e.target.name === "pf2e-items-sunder-wear.suppressArmourPotency" ||
         e.target.name === "pf2e-items-sunder-wear.suppressWeaponPotency"
      ) {
         toggleDependencies()
      }
   })
})
