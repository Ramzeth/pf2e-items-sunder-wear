/**
 * Smoke test: every module links.
 *
 * ESM resolves named imports at link time, so importing a module whose
 * dependency no longer exports a name it asks for throws immediately. That
 * makes a bare import the cheapest possible check that a rename was carried
 * through every file — which is the failure this suite exists to catch.
 *
 * Run with:  node --test test/imports.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"

/* Enough of Foundry for module top-level code to evaluate: the apps
 * destructure foundry.applications.api, settings.mjs calls foundry.utils
 * .debounce and registers a hook, main.mjs registers everything. */
globalThis.foundry = {
   applications: {
      api: {
         ApplicationV2: class {
            constructor(options = {}) {
               this.options = { window: {} , ...options }
            }
         },
         HandlebarsApplicationMixin: (Base) => Base,
      },
   },
   utils: {
      debounce: (fn) => fn,
      duplicate: (value) => structuredClone(value),
      expandObject: (value) => value,
      deepClone: (value) => structuredClone(value),
      mergeObject: (a, b) => ({ ...a, ...b }),
   },
}

const registeredHooks = []
globalThis.Hooks = {
   on: (event, fn) => registeredHooks.push(event),
   once: (event, fn) => registeredHooks.push(event),
   off: () => {},
}

globalThis.game = {
   settings: { register: () => {}, get: () => undefined },
   modules: { get: () => ({}) },
   i18n: { localize: (key) => key, format: (key) => key },
   user: { id: "test", isGM: true },
   actors: [],
}
globalThis.CONFIG = { PF2E: {} }
globalThis.ui = { notifications: { warn: () => {}, info: () => {} } }

const modules = [
   "../src/constants.mjs",
   "../src/logic.mjs",
   "../src/wear.mjs",
   "../src/settings.mjs",
   "../src/apps/durability-app.mjs",
   "../src/apps/npc-app.mjs",
   "../src/apps/persistent-app.mjs",
   "../src/apps/repair-app.mjs",
   "../src/apps/repair-forecast.mjs",
   "../src/apps/sunder-app.mjs",
   "../src/hooks/chat-hooks.mjs",
   "../src/hooks/combat-hooks.mjs",
   "../src/hooks/item-hooks.mjs",
   "../src/hooks/repair-hooks.mjs",
   "../src/hooks/sheet-hooks.mjs",
   "../src/hooks/wear-hooks.mjs",
   "../src/main.mjs",
]

for (const path of modules) {
   test(`links: ${path.replace("../src/", "")}`, async () => {
      const loaded = await import(path)
      assert.ok(loaded, `${path} produced no module namespace`)
   })
}

test("main.mjs registers the module's hooks", () => {
   assert.ok(
      registeredHooks.includes("preUpdateItem"),
      "item hooks were never registered",
   )
   assert.ok(
      registeredHooks.includes("renderActorSheet"),
      "sheet hooks were never registered",
   )
})
