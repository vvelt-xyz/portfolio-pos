/**
 * Force-write showcase menu seed via demo Auth (client SDK).
 *
 * Usage:
 *   node scripts/seed-showcase-menu.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";

const PROJECT_ID = "vvelt-portfolio-pos";
const STORE_ID = "default";
const EMAIL = "demo@vvelt.xyz";
const PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_PASSWORD ||
  process.env.FIREBASE_AUTH_PASSWORD ||
  "WeltPosDemo2026!";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function loadSeedCatalog() {
  const genPath = join(process.cwd(), ".tmp-menu-gen.json");
  if (!existsSync(genPath)) {
    throw new Error("missing .tmp-menu-gen.json");
  }
  const gen = JSON.parse(readFileSync(genPath, "utf8"));
  return {
    version: 2,
    largeCategories: [
      { id: "large_drink", name: "ドリンク", sortOrder: 1, kind: "menu" },
      { id: "large_nonalc", name: "ノンアル", sortOrder: 2, kind: "menu" },
      { id: "large_food", name: "フード", sortOrder: 3, kind: "menu" },
      { id: "large_dessert", name: "デザート", sortOrder: 4, kind: "menu" },
      { id: "large_plan", name: "プラン", sortOrder: 5, kind: "plan" },
    ],
    middleCategories: gen.middles,
    products: gen.products.map((p) => ({
      ...p,
      availableChannels: ["table", "takeout"],
    })),
    planDefinitions: gen.plans,
  };
}

const env = loadEnvLocal();
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);
const catalog = loadSeedCatalog();

await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const ref = doc(db, "stores", STORE_ID, "config", "menuCatalog");
await setDoc(ref, {
  catalog,
  updatedAt: new Date().toISOString(),
  source: "seed",
});
console.log(
  "ok: wrote menuCatalog products=",
  catalog.products.length,
  "middles=",
  catalog.middleCategories.length,
);
process.exit(0);
