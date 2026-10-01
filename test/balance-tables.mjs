/**
 * The three tables that any change to the repair ladder has to survive.
 *
 * This is not a unit test and node --test will not pick it up — it has no
 * assertions and it takes a minute or two to run. It is the instrument the
 * ladder in §7 was measured with, kept next to the tests because that is where
 * anybody who wants to change a number will come looking.
 *
 *   node test/balance-tables.mjs 20          the reference weapon
 *   node test/balance-tables.mjs 8           the flimsiest weapon in the book
 *   node test/balance-tables.mjs 64          an orichalcum blade
 *   node test/balance-tables.mjs 40 --divisor=80 --lives=10000     armour, quick
 *   node test/balance-tables.mjs 20 --k=1,0.8,0.6,0.4,0.2 --dc=0,2,4,6,8
 *
 * The ladder and the DC schedule are read from src/repair.mjs, so the tables
 * always describe what the module actually does. --k and --dc override them
 * for trying something out; everything else keeps its default.
 *
 * ── What is simulated ─────────────────────────────────────────────────────
 *
 * Full Monte Carlo, with every die actually rolled: a d20 for the check with
 * the degree shifted on a natural 20 or 1, and a d100 for the fractional part
 * of each limit loss. Closed-form arithmetic is not good enough here — it
 * cannot see the clamp at the broken threshold, cannot see an item die on the
 * bench, and cannot see a lifetime end early because the limit ran out.
 *
 * One "life" is an item's whole history: it serves from full down to the
 * repair point, gets repaired, serves again, and so on until either the limit
 * has closed to within a point of the repair point — no repair can return
 * anything then — or the item is destroyed. 100 000 lives per cell by default.
 *
 * Two rules the simulation must keep, because getting either wrong silently
 * flatters the ladder:
 *
 *   · the limit falls FIRST, then hit points heal against the new ceiling;
 *   · hit points only ever go up. Once mod × k reaches 1 the new limit lands
 *     below what the item already carries, and a repair that returns nothing
 *     must not also take something away. This was a real bug in the module
 *     before it was a note here.
 *
 * ── Reading the tables ────────────────────────────────────────────────────
 *
 * Rows are the **deficit**: the DC of rough repair minus the repairer's own
 * modifier. Deficit 0 is a smith who cannot fail at rough work; deficit 10 is
 * the reference point, a 55% success at rough work; deficit 20 is hopeless.
 * The step is always 1 — coarser steps hide exactly the boundaries the tables
 * exist to find. The "успех" column is the rough-work success chance, so each
 * finer grade is worse than the number in that column by its DC premium.
 *
 * Columns are the five grades a person may choose. ► marks the optimum.
 *
 *   1. Впитано HP за жизнь предмета — does the ladder have a gradient at all?
 *      The optimum should slide down about one grade every two points of
 *      deficit and cover all five. A grade that is optimal nowhere is a dead
 *      step, and a dead step is a bug in the numbers.
 *
 *   2. Доля уничтоженных на верстаке — what the first table cannot show. An
 *      item can die faster than it exhausts its limit, and when it does every
 *      other metric is describing a life that never happened.
 *
 *   3. Минут на 1 восстановленный HP — the denominator is HP **restored**,
 *      never HP absorbed. Absorbed includes the service before the first
 *      repair, which nobody worked for, and counting it makes short lives look
 *      efficient. Failed attempts go in the numerator and not the denominator,
 *      which is the whole point: a grade that fails often is slow even when
 *      each success is large. A dash means nothing was ever restored.
 *
 * Tables 1 and 3 disagree on purpose, and the disagreement is the design: when
 * the limit is the scarce thing, climb the ladder; when time is scarce, slap a
 * rough patch on it.
 *
 * ── The law worth remembering ─────────────────────────────────────────────
 *
 *   суммарно впитано = делитель × (1 − точка_ремонта / База)
 *
 * The base cancels. That is why material parity is algebraic rather than
 * tuned, and why the divisor — not the item — is the ceiling on how much life
 * repair can ever add. It also means repairing later is worth more per repair
 * and riskier, which is a choice left to the player.
 */

import { REPAIR_TIERS, ROUGH_TIER, FINEST_TIER } from "../src/repair.mjs"

const NAMES = ["Грубый", "Аккурат.", "Тонкий", "Ювелир.", "Безупр."]

/* RAW budgets for a trained repairer. The absolute figures barely matter —
 * they only set the pace of table 3 — but the 2:1 ratio between a critical
 * success and a plain one does. */
const BUDGET_SUCCESS = 10
const BUDGET_CRIT = 20

const args = process.argv.slice(2)
const flag = (name, fallback) => {
   const found = args.find((arg) => arg.startsWith(`--${name}=`))
   return found === undefined ? fallback : found.slice(name.length + 3)
}
const numbers = (text) => text.split(",").map(Number)

const BASE = Number(args.find((arg) => !arg.startsWith("--")) ?? 20)
const DIVISOR = Number(flag("divisor", 40))
const BT = Math.floor(BASE * Number(flag("bt", 0.25)))
const REPAIR_AT = Math.floor(BASE * Number(flag("repair-at", 0.5)))
const LIVES = Number(flag("lives", 100000))
const MATERIAL_MOD = BASE / DIVISOR

/* Index 0 is the grade a critical failure drops you to and the last is where a
 * critical success lifts you; neither can be chosen, and both exist only to
 * receive those shifts. --k names the five in between. */
const kOverride = flag("k")
const K = kOverride
   ? [REPAIR_TIERS[0].k, ...numbers(kOverride), REPAIR_TIERS.at(-1).k]
   : REPAIR_TIERS.map((tier) => tier.k)

const SCHEDULE = flag("dc")
   ? numbers(flag("dc"))
   : REPAIR_TIERS.slice(ROUGH_TIER, FINEST_TIER + 1).map((tier) => tier.dc)

const d = (faces) => 1 + Math.floor(Math.random() * faces)

/** A check, as the system resolves one: bands of ten, naturals shift a step. */
function roll(dc) {
   const die = d(20)
   let degree = die >= dc + 10 ? 3 : die >= dc ? 2 : die <= dc - 10 ? 0 : 1
   if (die === 20) degree = Math.min(3, degree + 1)
   if (die === 1) degree = Math.max(0, degree - 1)
   return degree
}

/** The whole part is certain, the fraction is a d100. */
const resolveLoss = (loss) => {
   const whole = Math.floor(loss)
   return whole + (d(100) <= (loss - whole) * 100 ? 1 : 0)
}

/**
 * One item, from the forge to the scrap heap, repaired at `tierIndex` every
 * time it reaches the repair point.
 */
function live(tierIndex, deficit) {
   const dc = deficit + SCHEDULE[tierIndex - 1]
   let limit = BASE
   let hp = BASE
   let absorbed = 0
   let restored = 0
   let minutes = 0
   let destroyed = false

   for (let guard = 0; guard < 5000; guard += 1) {
      // Service: everything above the repair point is soaked up in the field.
      absorbed += Math.max(0, hp - REPAIR_AT)
      hp = Math.min(hp, REPAIR_AT)

      // Nothing left to win back: the limit has closed on the repair point.
      if (limit - hp < 1) break

      const degree = roll(dc)

      // A critical moves the grade delivered one step either way.
      const delivered = Math.max(
         0,
         Math.min(
            K.length - 1,
            tierIndex + (degree === 3 ? 1 : degree === 0 ? -1 : 0),
         ),
      )

      // Step one, always: the limit, against the damage carried right now.
      limit = Math.max(
         BT,
         limit - resolveLoss((limit - hp) * MATERIAL_MOD * K[delivered]),
      )

      // A botched repair costs a flat point, past every kind of Hardness.
      if (degree === 0) {
         hp -= 1
         minutes += 10
         if (hp <= 0) {
            destroyed = true
            break
         }
         continue
      }

      // Step two: healing, against whatever ceiling is left. Never downwards.
      if (degree >= 2) {
         const gained = Math.max(0, limit - hp)
         minutes +=
            gained > 0
               ? (gained / (degree === 3 ? BUDGET_CRIT : BUDGET_SUCCESS)) * 10
               : 10
         restored += gained
         hp += gained
      } else {
         minutes += 10
      }
   }

   absorbed += Math.max(0, hp)
   return { absorbed, restored, minutes, destroyed }
}

const cell = (tierIndex, deficit) => {
   let absorbed = 0
   let restored = 0
   let minutes = 0
   let destroyed = 0

   for (let i = 0; i < LIVES; i += 1) {
      const result = live(tierIndex, deficit)
      absorbed += result.absorbed
      restored += result.restored
      minutes += result.minutes
      if (result.destroyed) destroyed += 1
   }

   return {
      absorbed: absorbed / LIVES,
      destroyed: destroyed / LIVES,
      minutesPerHp: restored > 0 ? minutes / restored : Infinity,
   }
}

const grid = []
for (let deficit = 0; deficit <= 20; deficit += 1)
   grid.push({ deficit, cells: [1, 2, 3, 4, 5].map((t) => cell(t, deficit)) })

const successChance = (deficit) =>
   `${Math.max(0, Math.min(20, 21 - deficit)) * 5}%`

console.log(
   `База ${BASE}, ПП ${BT}, ремонт при ${REPAIR_AT} HP, делитель ${DIVISOR}, ` +
      `mod ${MATERIAL_MOD.toFixed(2)}, ` +
      `${LIVES.toLocaleString("ru")} жизней на ячейку`,
)
console.log(`k ${K.join(" / ")}   DC +${SCHEDULE.join(" / +")}`)

const show = (title, pick, format, better) => {
   console.log(
      `\n${title}\n` +
         "разрыв".padEnd(9) +
         "успех".padEnd(8) +
         NAMES.map((name) => name.padEnd(11)).join("") +
         "оптимум",
   )

   for (const row of grid) {
      const values = row.cells.map(pick)
      const best = values.reduce((a, v, i) => (better(v, values[a]) ? i : a), 0)

      console.log(
         String(row.deficit).padEnd(9) +
            successChance(row.deficit).padEnd(8) +
            values
               .map((v, i) =>
                  (i === best ? `►${format(v)}` : format(v)).padEnd(11),
               )
               .join("") +
            NAMES[best],
      )
   }
}

show(
   "1. Впитано HP за жизнь предмета",
   (c) => c.absorbed,
   (v) => v.toFixed(1),
   (a, b) => a > b,
)
show(
   "2. Доля уничтоженных на верстаке",
   (c) => c.destroyed,
   (v) => `${(v * 100).toFixed(1)}%`,
   (a, b) => a < b,
)
show(
   "3. Минут на 1 восстановленный HP — меньше лучше",
   (c) => c.minutesPerHp,
   (v) => (Number.isFinite(v) ? v.toFixed(2) : "—"),
   (a, b) => a < b,
)
