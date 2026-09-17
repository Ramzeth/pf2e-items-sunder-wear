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
   game.settings.register("pf2e-aztecs-sundered", "showInventoryUI", {
      name: "pf2e-aztecs-sundered.settings.showInventoryUI.name",
      hint: "pf2e-aztecs-sundered.settings.showInventoryUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "showInventoryUI_players", {
      name: "pf2e-aztecs-sundered.settings.showForPlayers.name",
      hint: "pf2e-aztecs-sundered.settings.showForPlayers.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "showDamageButtonUI", {
      name: "pf2e-aztecs-sundered.settings.showDamageButtonUI.name",
      hint: "pf2e-aztecs-sundered.settings.showDamageButtonUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register(
      "pf2e-aztecs-sundered",
      "showDamageButtonUI_players",
      {
         name: "pf2e-aztecs-sundered.settings.showForPlayers.name",
         hint: "pf2e-aztecs-sundered.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: true,
         requiresReload: true,
      },
   )

   game.settings.register(
      "pf2e-aztecs-sundered",
      "showTrackDurabilityButtonUI",
      {
         name: "pf2e-aztecs-sundered.settings.showTrackDurabilityButtonUI.name",
         hint: "pf2e-aztecs-sundered.settings.showTrackDurabilityButtonUI.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: false,
         requiresReload: true,
      },
   )

   game.settings.register(
      "pf2e-aztecs-sundered",
      "showTrackDurabilityButtonUI_players",
      {
         name: "pf2e-aztecs-sundered.settings.showForPlayers.name",
         hint: "pf2e-aztecs-sundered.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: false,
         requiresReload: true,
      },
   )

   game.settings.register("pf2e-aztecs-sundered", "showRepairButtonUI", {
      name: "pf2e-aztecs-sundered.settings.showRepairButtonUI.name",
      hint: "pf2e-aztecs-sundered.settings.showRepairButtonUI.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true,
   })

   game.settings.register(
      "pf2e-aztecs-sundered",
      "showRepairButtonUI_players",
      {
         name: "pf2e-aztecs-sundered.settings.showForPlayers.name",
         hint: "pf2e-aztecs-sundered.settings.showForPlayers.hint",
         scope: "world",
         config: true,
         type: Boolean,
         default: true,
         requiresReload: true,
      },
   )

   game.settings.register("pf2e-aztecs-sundered", "enableArmourPenalty", {
      name: "pf2e-aztecs-sundered.settings.enableArmourPenalty.name",
      hint: "pf2e-aztecs-sundered.settings.enableArmourPenalty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "armourPenaltyLight", {
      name: "pf2e-aztecs-sundered.settings.armourPenaltyLight.name",
      hint: "pf2e-aztecs-sundered.settings.armourPenaltyLight.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -1,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "armourPenaltyMedium", {
      name: "pf2e-aztecs-sundered.settings.armourPenaltyMedium.name",
      hint: "pf2e-aztecs-sundered.settings.armourPenaltyMedium.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -2,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "armourPenaltyHeavy", {
      name: "pf2e-aztecs-sundered.settings.armourPenaltyHeavy.name",
      hint: "pf2e-aztecs-sundered.settings.armourPenaltyHeavy.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -3,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "laminarPenaltyReduction", {
      name: "pf2e-aztecs-sundered.settings.laminarPenaltyReduction.name",
      hint: "pf2e-aztecs-sundered.settings.laminarPenaltyReduction.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -1,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "enableWeaponPenalty", {
      name: "pf2e-aztecs-sundered.settings.enableWeaponPenalty.name",
      hint: "pf2e-aztecs-sundered.settings.enableWeaponPenalty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "weaponPenaltyAmount", {
      name: "pf2e-aztecs-sundered.settings.weaponPenaltyAmount.name",
      hint: "pf2e-aztecs-sundered.settings.weaponPenaltyAmount.hint",
      scope: "world",
      config: true,
      type: Number,
      default: -2,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressArmourPotency", {
      name: "pf2e-aztecs-sundered.settings.suppressArmourPotency.name",
      hint: "pf2e-aztecs-sundered.settings.suppressArmourPotency.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressArmourResilient", {
      name: "pf2e-aztecs-sundered.settings.suppressArmourResilient.name",
      hint: "pf2e-aztecs-sundered.settings.suppressArmourResilient.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressArmourProperty", {
      name: "pf2e-aztecs-sundered.settings.suppressArmourProperty.name",
      hint: "pf2e-aztecs-sundered.settings.suppressArmourProperty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressWeaponPotency", {
      name: "pf2e-aztecs-sundered.settings.suppressWeaponPotency.name",
      hint: "pf2e-aztecs-sundered.settings.suppressWeaponPotency.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressWeaponStriking", {
      name: "pf2e-aztecs-sundered.settings.suppressWeaponStriking.name",
      hint: "pf2e-aztecs-sundered.settings.suppressWeaponStriking.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "suppressWeaponProperty", {
      name: "pf2e-aztecs-sundered.settings.suppressWeaponProperty.name",
      hint: "pf2e-aztecs-sundered.settings.suppressWeaponProperty.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: forceStateSync,
   })

   game.settings.register("pf2e-aztecs-sundered", "restrictPreciousMaterial", {
      name: "pf2e-aztecs-sundered.settings.restrictPreciousMaterial.name",
      hint: "pf2e-aztecs-sundered.settings.restrictPreciousMaterial.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })

   game.settings.register("pf2e-aztecs-sundered", "injectSunderButton", {
      name: "pf2e-aztecs-sundered.settings.injectSunderButton.name",
      hint: "pf2e-aztecs-sundered.settings.injectSunderButton.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "allowPlayersSunderButton", {
      name: "pf2e-aztecs-sundered.settings.allowPlayersSunderButton.name",
      hint: "pf2e-aztecs-sundered.settings.allowPlayersSunderButton.hint",
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

   game.settings.register("pf2e-aztecs-sundered", "enableWearSystem", {
      name: "pf2e-aztecs-sundered.settings.enableWearSystem.name",
      hint: "pf2e-aztecs-sundered.settings.enableWearSystem.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })

   game.settings.register("pf2e-aztecs-sundered", "enableWeaponWear", {
      name: "pf2e-aztecs-sundered.settings.enableWeaponWear.name",
      hint: "pf2e-aztecs-sundered.settings.enableWeaponWear.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "enableArmourWear", {
      name: "pf2e-aztecs-sundered.settings.enableArmourWear.name",
      hint: "pf2e-aztecs-sundered.settings.enableArmourWear.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearFullRepair", {
      name: "pf2e-aztecs-sundered.settings.wearFullRepair.name",
      hint: "pf2e-aztecs-sundered.settings.wearFullRepair.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearDamageFormula", {
      name: "pf2e-aztecs-sundered.settings.wearDamageFormula.name",
      hint: "pf2e-aztecs-sundered.settings.wearDamageFormula.hint",
      scope: "world",
      config: true,
      type: String,
      default: "1d4",
   })

   game.settings.register("pf2e-aztecs-sundered", "wearBrokenStrikeCost", {
      name: "pf2e-aztecs-sundered.settings.wearBrokenStrikeCost.name",
      hint: "pf2e-aztecs-sundered.settings.wearBrokenStrikeCost.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearWeaponDivisor", {
      name: "pf2e-aztecs-sundered.settings.wearWeaponDivisor.name",
      hint: "pf2e-aztecs-sundered.settings.wearWeaponDivisor.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 40,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearArmourDivisor", {
      name: "pf2e-aztecs-sundered.settings.wearArmourDivisor.name",
      hint: "pf2e-aztecs-sundered.settings.wearArmourDivisor.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 80,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearWeaponBtPercent", {
      name: "pf2e-aztecs-sundered.settings.wearWeaponBtPercent.name",
      hint: "pf2e-aztecs-sundered.settings.wearWeaponBtPercent.hint",
      scope: "world",
      config: true,
      type: Number,
      default: 25,
   })

   game.settings.register("pf2e-aztecs-sundered", "wearArmourBtPercent", {
      name: "pf2e-aztecs-sundered.settings.wearArmourBtPercent.name",
      hint: "pf2e-aztecs-sundered.settings.wearArmourBtPercent.hint",
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
         'input[name="pf2e-aztecs-sundered.showInventoryUI"]',
      )
      const showInventoryUIPlayers = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showInventoryUI_players"]',
      )

      const showDamageUI = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showDamageButtonUI"]',
      )
      const showDamageUIPlayers = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showDamageButtonUI_players"]',
      )

      const showTrackUI = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showTrackDurabilityButtonUI"]',
      )
      const showTrackUIPlayers = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showTrackDurabilityButtonUI_players"]',
      )

      const showRepairUI = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showRepairButtonUI"]',
      )
      const showRepairUIPlayers = html.querySelector(
         'input[name="pf2e-aztecs-sundered.showRepairButtonUI_players"]',
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
         'input[name="pf2e-aztecs-sundered.suppressArmourPotency"]',
      )
      const armourResilient = html.querySelector(
         'input[name="pf2e-aztecs-sundered.suppressArmourResilient"]',
      )
      const armourProperty = html.querySelector(
         'input[name="pf2e-aztecs-sundered.suppressArmourProperty"]',
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
         'input[name="pf2e-aztecs-sundered.suppressWeaponPotency"]',
      )
      const weaponStriking = html.querySelector(
         'input[name="pf2e-aztecs-sundered.suppressWeaponStriking"]',
      )
      const weaponProperty = html.querySelector(
         'input[name="pf2e-aztecs-sundered.suppressWeaponProperty"]',
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
         'input[name="pf2e-aztecs-sundered.enableWearSystem"]',
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
            `[name="pf2e-aztecs-sundered.${key}"]`,
         )
         const group = input?.closest(".form-group")
         if (group) group.style.display = master.checked ? "" : "none"
      })
   }

   toggleUIDependencies()
   toggleDependencies()
   toggleWearDependencies()

   html.addEventListener("change", (e) => {
      if (e.target.name === "pf2e-aztecs-sundered.enableWearSystem") {
         toggleWearDependencies()
      } else if (e.target.name.startsWith("pf2e-aztecs-sundered.show")) {
         toggleUIDependencies()
      } else if (
         e.target.name === "pf2e-aztecs-sundered.suppressArmourPotency" ||
         e.target.name === "pf2e-aztecs-sundered.suppressWeaponPotency"
      ) {
         toggleDependencies()
      }
   })
})
