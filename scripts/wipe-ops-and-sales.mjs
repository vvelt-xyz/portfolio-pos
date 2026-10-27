/**
 * One-shot: wipe ops + sales (+ related) for store `default`.
 * KEEP: config/menuCatalog, config/taxPolicy, config/sessionTags
 *
 * Usage (Git Bash):
 *   node scripts/wipe-ops-and-sales.mjs
 */
import { execSync } from "node:child_process";

const STORE = "default";
const PROJECT = "vvelt-portfolio-pos";

/** Wipe these collections entirely. */
const WIPE_COLLECTIONS = [
  "sessions",
  "orderLines",
  "orderBatches",
  "writeOffs",
  "opsEvents",
  "sales",
  "seats",
  "businessDays",
];

/** Do NOT touch these config docs. */
const KEEP_CONFIG = ["menuCatalog", "taxPolicy", "sessionTags"];

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true });
}

console.log("Wipe ops/sales for", PROJECT, `stores/${STORE}`);
console.log("KEEP config:", KEEP_CONFIG.join(", "));
console.log("WIPE collections:", WIPE_COLLECTIONS.join(", "));

for (const name of WIPE_COLLECTIONS) {
  const path = `stores/${STORE}/${name}`;
  run(
    `npx firebase-tools firestore:delete "${path}" --project ${PROJECT} --recursive --force`,
  );
}

// Reset daily session sequence meta (keep doc, empty seq map).
run(
  `npx firebase-tools firestore:delete "stores/${STORE}/config/opsMeta" --project ${PROJECT} --force`,
);

console.log("\nDone. Browser: clear localStorage key pos_v1_state (or hard-reset demo) so local cache does not resurrect old sessions.");
console.log("Masters kept: menuCatalog / taxPolicy / sessionTags.");
