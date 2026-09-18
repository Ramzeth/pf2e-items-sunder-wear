import { physicalTypes } from "../constants.mjs"
import {
   getDefaultDurability,
   applyNPCArmorPenalties,
   removeNPCArmorPenalties,
   applyNPCWeaponPenalties,
   removeNPCWeaponPenalties,
} from "../logic.mjs"
import { NpcPenaltyApp } from "../apps/npc-app.mjs"
import {
   getBrokenThreshold,
   getRepairLimit,
   getWearBase,
   getWearProfile,
} from "../wear.mjs"

export function registerItemHooks() {
   Hooks.on("preUpdateItem", (item, changes, options, userId) => {
      if (game.user.id !== userId) return

      if (changes.system && changes.system.containerId !== undefined) {
         if (changes.system.containerId !== null && item.actor) {
            let backpackContainer = item.actor.items.get(
               changes.system.containerId,
            )
            if (
               backpackContainer &&
               backpackContainer.type === "backpack" &&
               backpackContainer.getFlag("world", "maxHp") !== undefined
            ) {
               if (
                  (backpackContainer.getFlag("world", "currentHp") ?? 0) <=
                  getBrokenThreshold(
                     backpackContainer,
                     backpackContainer.getFlag("world", "maxHp"),
                  )
               ) {
                  ui.notifications.warn(
                     game.i18n.format(
                        "pf2e-items-sunder-wear.notifications.cant-stow",
                        { containerName: backpackContainer.name },
                     ),
                  )
                  delete changes.system.containerId
               }
            }
         }
      }

      if (!physicalTypes.includes(item.type)) return

      let isShield = item.type === "shield"
      let isDefaultType =
         item.type === "armor" || item.type === "weapon" || isShield
      let defaultDurabilityStats = getDefaultDurability(item)

      let wearProfile = getWearProfile(item)

      /* The only thing the later updateItem hook cannot work out for itself.
       * Everything else it needs — the base, the threshold, the new HP — is
       * readable off the item once the write has landed, but the HP an item
       * had *before* the write is gone for good. Transitions like "was whole,
       * is now broken" depend on it. */
      options.aztecHpBefore = isShield
         ? (item.system.hp?.value ?? 0)
         : (item.getFlag("world", "currentHp") ??
           (isDefaultType ? defaultDurabilityStats.maxHp : 0))

      /* The ceiling current HP may reach once this update is applied: the
       * repair limit inside the wear system, plain max HP outside it. Local
       * to this hook — nothing downstream needs it. */
      let incomingFlags = changes.flags?.world ?? {}
      let repairLimitBefore =
         getRepairLimit(item) ||
         (isDefaultType ? defaultDurabilityStats.maxHp : 1)
      let repairLimit
      if (isShield) {
         repairLimit = changes.system?.hp?.max ?? repairLimitBefore
      } else if (!wearProfile) {
         repairLimit = incomingFlags.maxHp ?? repairLimitBefore
      } else if (incomingFlags["-=repairLimit"] !== undefined) {
         // The limit is being cleared: a town repair, or a remake after a
         // material change. Either way the item is back at its base.
         repairLimit = incomingFlags.maxHp ?? getWearBase(item)
      } else {
         // Inside the system only an incoming repair limit moves the ceiling.
         // Editing the base leaves a tired item tired.
         repairLimit = incomingFlags.repairLimit ?? repairLimitBefore
      }

      let newCurrentHitPoints = isShield
         ? (changes.system?.hp?.value ?? options.aztecHpBefore)
         : (changes.flags?.world?.currentHp ?? options.aztecHpBefore)

      if (newCurrentHitPoints > repairLimit) {
         newCurrentHitPoints = repairLimit
         if (isShield) {
            changes.system = changes.system || {}
            changes.system.hp = changes.system.hp || {}
            changes.system.hp.value = repairLimit
         } else {
            changes.flags = changes.flags || {}
            changes.flags.world = changes.flags.world || {}
            changes.flags.world.currentHp = repairLimit
         }
      }

      /* The base may be changing in this very update, and it has not been
       * written yet — hence the explicit second argument here and nowhere
       * else. Outside the system the ceiling and the base are the same
       * number, so passing the ceiling is passing the base. */
      let brokenThreshold = getBrokenThreshold(item, repairLimit)
      let isBroken = repairLimit > 0 && newCurrentHitPoints <= brokenThreshold

      if (
         newCurrentHitPoints === 0 &&
         (isDefaultType || item.getFlag("world", "maxHp") !== undefined)
      ) {
         if (changes.system?.equipped) {
            let newCarryType =
               changes.system.equipped.carryType ??
               item.system.equipped?.carryType
            if (
               !["dropped", "stowed", "worn"].includes(newCarryType) ||
               (changes.system.equipped.inSlot ??
                  item.system.equipped?.inSlot) === true
            ) {
               ui.notifications.warn(
                  game.i18n.format(
                     "pf2e-items-sunder-wear.notifications.cant-equip",
                     { itemName: item.name },
                  ),
               )
               delete changes.system.equipped
            }
         }
         if (options.aztecHpBefore > 0) {
            changes.system = changes.system || {}
            changes.system.equipped = changes.system.equipped || {}
            Object.assign(changes.system.equipped, {
               carryType: "worn",
               inSlot: false,
               handsHeld: 0,
               invested: false,
            })
         }
      }

      if (item.actor?.type === "npc" || isShield) return

      let itemRules = foundry.utils.duplicate(item.system.rules || [])
      let rulesHaveChanged = false

      if (item.type === "armor") {
         let armorPenalty =
            item.system.category === "light"
               ? game.settings.get("pf2e-items-sunder-wear", "armourPenaltyLight")
               : item.system.category === "medium"
                 ? game.settings.get(
                      "pf2e-items-sunder-wear",
                      "armourPenaltyMedium",
                   )
                 : item.system.category === "heavy"
                   ? game.settings.get(
                        "pf2e-items-sunder-wear",
                        "armourPenaltyHeavy",
                     )
                   : 0

         if (item.system.traits?.value?.includes("laminar")) {
            armorPenalty = Math.min(
               0,
               armorPenalty -
                  game.settings.get(
                     "pf2e-items-sunder-wear",
                     "laminarPenaltyReduction",
                  ),
            )
         }

         let brokenArmorIndex = itemRules.findIndex(
            (rule) => rule.slug === "broken-armour-penalty",
         )

         if (
            isBroken &&
            game.settings.get("pf2e-items-sunder-wear", "enableArmourPenalty") &&
            armorPenalty !== 0
         ) {
            if (brokenArmorIndex === -1) {
               itemRules.push({
                  key: "FlatModifier",
                  selector: "ac",
                  value: armorPenalty,
                  slug: "broken-armour-penalty",
                  label: game.i18n.localize(
                     "pf2e-items-sunder-wear.rule-elements.broken.armor",
                  ),
               })
               rulesHaveChanged = true
            } else if (itemRules[brokenArmorIndex].value !== armorPenalty) {
               itemRules[brokenArmorIndex].value = armorPenalty
               rulesHaveChanged = true
            }
         } else if (brokenArmorIndex !== -1) {
            itemRules.splice(brokenArmorIndex, 1)
            rulesHaveChanged = true
         }
      }

      if (item.type === "weapon") {
         let weaponPenaltyAmount = game.settings.get(
            "pf2e-items-sunder-wear",
            "weaponPenaltyAmount",
         )
         let brokenAttackIndex = itemRules.findIndex(
            (rule) => rule.slug === "broken-weapon-attack",
         )
         let brokenDamageIndex = itemRules.findIndex(
            (rule) => rule.slug === "broken-weapon-damage",
         )

         if (
            isBroken &&
            game.settings.get("pf2e-items-sunder-wear", "enableWeaponPenalty") &&
            weaponPenaltyAmount !== 0
         ) {
            if (brokenAttackIndex === -1) {
               itemRules.push({
                  key: "FlatModifier",
                  selector: "attack",
                  type: "item",
                  value: weaponPenaltyAmount,
                  slug: "broken-weapon-attack",
                  label: game.i18n.localize(
                     "pf2e-items-sunder-wear.rule-elements.broken.weapon",
                  ),
               })
               rulesHaveChanged = true
            } else if (
               itemRules[brokenAttackIndex].value !== weaponPenaltyAmount
            ) {
               itemRules[brokenAttackIndex].value = weaponPenaltyAmount
               rulesHaveChanged = true
            }
            if (brokenDamageIndex === -1) {
               itemRules.push({
                  key: "FlatModifier",
                  selector: "damage",
                  type: "item",
                  value: weaponPenaltyAmount,
                  slug: "broken-weapon-damage",
                  label: game.i18n.localize(
                     "pf2e-items-sunder-wear.rule-elements.broken.weapon",
                  ),
               })
               rulesHaveChanged = true
            } else if (
               itemRules[brokenDamageIndex].value !== weaponPenaltyAmount
            ) {
               itemRules[brokenDamageIndex].value = weaponPenaltyAmount
               rulesHaveChanged = true
            }
         } else {
            if (brokenAttackIndex !== -1 || brokenDamageIndex !== -1) {
               ;[brokenDamageIndex, brokenAttackIndex]
                  .sort((a, b) => b - a)
                  .forEach((indexPosition) => {
                     if (indexPosition !== -1)
                        itemRules.splice(indexPosition, 1)
                  })
               rulesHaveChanged = true
            }
         }
      }

      if (rulesHaveChanged) {
         changes.system = changes.system || {}
         changes.system.rules = itemRules
      }

      let runesBackup = item.getFlag("world", "runesBackup")
      if (isBroken) {
         if (!runesBackup) {
            runesBackup = foundry.utils.duplicate(item.system.runes || {})
            changes.flags = changes.flags || {}
            changes.flags.world = changes.flags.world || {}
            changes.flags.world.runesBackup = runesBackup
         }
         let desiredRunes = foundry.utils.duplicate(runesBackup)

         if (item.type === "armor") {
            if (
               game.settings.get(
                  "pf2e-items-sunder-wear",
                  "suppressArmourPotency",
               )
            ) {
               desiredRunes.potency = 0
               desiredRunes.resilient = 0
               desiredRunes.property = []
            } else {
               if (
                  game.settings.get(
                     "pf2e-items-sunder-wear",
                     "suppressArmourResilient",
                  )
               )
                  desiredRunes.resilient = 0
               if (
                  game.settings.get(
                     "pf2e-items-sunder-wear",
                     "suppressArmourProperty",
                  )
               )
                  desiredRunes.property = []
            }
         } else if (item.type === "weapon") {
            if (
               game.settings.get(
                  "pf2e-items-sunder-wear",
                  "suppressWeaponPotency",
               )
            ) {
               desiredRunes.potency = 0
               desiredRunes.striking = 0
               desiredRunes.property = []
            } else {
               if (
                  game.settings.get(
                     "pf2e-items-sunder-wear",
                     "suppressWeaponStriking",
                  )
               )
                  desiredRunes.striking = 0
               if (
                  game.settings.get(
                     "pf2e-items-sunder-wear",
                     "suppressWeaponProperty",
                  )
               )
                  desiredRunes.property = []
            }
         }
         changes.system = changes.system || {}
         changes.system.runes = desiredRunes
      } else if (
         // Was broken, is not any more: the runes come back. This sits inside
         // preUpdateItem, where the item still holds its old data, so the
         // "before" side is simply read off it.
         options.aztecHpBefore <= getBrokenThreshold(item) &&
         !isBroken &&
         runesBackup
      ) {
         changes.system = changes.system || {}
         changes.system.runes = foundry.utils.duplicate(runesBackup)
         changes.flags = changes.flags || {}
         changes.flags.world = changes.flags.world || {}
         changes.flags.world["-=runesBackup"] = null
      }
   })

   Hooks.on("updateItem", async (item, changes, options, userId) => {
      if (game.user.id !== userId) return

      if (
         item.type === "backpack" &&
         item.actor &&
         options.aztecHpBefore > 0 &&
         item.getFlag("world", "currentHp") <= 0
      ) {
         const backpackContents = item.actor.items.filter(
            (i) => i.system.containerId === item.id,
         )
         if (backpackContents.length > 0)
            await item.actor.updateEmbeddedDocuments(
               "Item",
               backpackContents.map((containedItem) => ({
                  _id: containedItem.id,
                  "system.containerId": null,
                  "system.equipped.carryType": "dropped",
               })),
            )
      }

      if (item.type !== "armor" && item.type !== "weapon") return

      let expandedChanges = foundry.utils.expandObject(changes)
      if (
         expandedChanges.system?.material !== undefined ||
         expandedChanges.flags?.world?.usePreciousMaterial !== undefined ||
         expandedChanges.system?.baseItem !== undefined ||
         expandedChanges.flags?.world?.assignedMaterial !== undefined
      ) {
         /* Changing an item's material means the item has been remade, so it
          * comes back as a new object: a fresh base, full hit points and no
          * repair history — the limit flag is cleared rather than set, which
          * is the same thing as "at the base".
          *
          * Current HP used to be carried over proportionally, a blade at half
          * HP staying at half after the change. That made sense while max HP
          * was only a material lookup, but there is nothing to carry over
          * from an item that no longer exists.
          *
          * A base supplied in the very same update wins over the material
          * table: that is a caller stating the new base explicitly. */
         let defaultDurabilityStats = getDefaultDurability(item)
         let explicitBase = expandedChanges.flags?.world?.maxHp
         let newBase =
            explicitBase !== undefined
               ? explicitBase
               : defaultDurabilityStats.maxHp

         if (
            item.getFlag("world", "maxHp") !== newBase ||
            item.getFlag("world", "repairLimit") !== undefined ||
            item.getFlag("world", "hardness") !==
               defaultDurabilityStats.hardness
         ) {
            await item.update({
               "flags.world.maxHp": newBase,
               "flags.world.currentHp": newBase,
               "flags.world.hardness": defaultDurabilityStats.hardness,
               "flags.world.-=repairLimit": null,
            })
         }
      }

      if (item.actor?.type === "npc") {
         let hpBefore = options.aztecHpBefore ?? 0
         let hpNow = item.getFlag("world", "currentHp") ?? 0

         /* One threshold, not two. It is a fixed share of the base and cannot
          * move inside a single update, so comparing the before and after HP
          * against the same number is both simpler and more honest than
          * deriving a separate threshold for each side. */
         let brokenThreshold = getBrokenThreshold(item)

         const processNPCChoices = async (npcChoices) => {
            if (!npcChoices) return
            if (item.type === "armor") {
               await removeNPCArmorPenalties(item)
               await applyNPCArmorPenalties(item, npcChoices)
            }
            if (item.type === "weapon") {
               await removeNPCWeaponPenalties(item)
               await applyNPCWeaponPenalties(item, npcChoices)
            }
         }

         if (hpBefore > 0 && hpNow <= 0) {
            new NpcPenaltyApp({
               item,
               isDestroyed: true,
               resolve: processNPCChoices,
            }).render(true)
         } else if (
            hpBefore > brokenThreshold &&
            hpNow <= brokenThreshold
         ) {
            new NpcPenaltyApp({
               item,
               isDestroyed: false,
               resolve: processNPCChoices,
            }).render(true)
         } else if (
            hpBefore <= brokenThreshold &&
            hpNow > brokenThreshold
         ) {
            if (item.type === "armor") await removeNPCArmorPenalties(item)
            if (item.type === "weapon") await removeNPCWeaponPenalties(item)
         }
      }
   })
}
