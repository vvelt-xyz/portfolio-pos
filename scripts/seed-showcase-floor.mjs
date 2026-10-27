/**
 * Force-write showcase floor layout via demo Auth (client SDK).
 *
 * Usage:
 *   node scripts/seed-showcase-floor.mjs
 *
 * Keep CATALOG in sync with DEFAULT_FLOOR_LAYOUT in src/domain/floor-layout.ts
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

function rectShape(w, h) {
  const cells = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) cells.push({ col, row });
  }
  return cells;
}

/** Mirrors DEFAULT_FLOOR_LAYOUT (version 4): no bar 5/6, tighter table↔bar gap. */
const CATALOG = {
  version: 4,
  gridCols: 48,
  gridRows: 26,
  maxCanvasWidthPx: 640,
  opsBoardHeightRem: 15.5,
  categories: [
    {
      id: "cat_table",
      name: "テーブル",
      sortOrder: 10,
      enabled: true,
      capacity: 2,
      cells: rectShape(12, 8),
    },
    {
      id: "cat_bar",
      name: "バー",
      sortOrder: 20,
      enabled: true,
      capacity: 1,
      cells: rectShape(8, 8),
    },
  ],
  seats: [
    {
      id: "seat_t1",
      categoryId: "cat_table",
      number: 1,
      capacity: 2,
      anchorCol: 0,
      anchorRow: 0,
    },
    {
      id: "seat_t2",
      categoryId: "cat_table",
      number: 2,
      capacity: 2,
      anchorCol: 12,
      anchorRow: 0,
    },
    {
      id: "seat_t3",
      categoryId: "cat_table",
      number: 3,
      capacity: 2,
      anchorCol: 24,
      anchorRow: 0,
    },
    {
      id: "seat_t4",
      categoryId: "cat_table",
      number: 4,
      capacity: 2,
      anchorCol: 36,
      anchorRow: 0,
    },
    {
      id: "seat_b6",
      categoryId: "cat_bar",
      number: 1,
      capacity: 1,
      anchorCol: 0,
      anchorRow: 18,
    },
    {
      id: "seat_b5",
      categoryId: "cat_bar",
      number: 2,
      capacity: 1,
      anchorCol: 8,
      anchorRow: 18,
    },
    {
      id: "seat_b4",
      categoryId: "cat_bar",
      number: 3,
      capacity: 1,
      anchorCol: 16,
      anchorRow: 18,
    },
    {
      id: "seat_b3",
      categoryId: "cat_bar",
      number: 4,
      capacity: 1,
      anchorCol: 24,
      anchorRow: 18,
    },
  ],
};

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

await signInWithEmailAndPassword(auth, EMAIL, env.NEXT_PUBLIC_DEMO_PASSWORD || PASSWORD);
const ref = doc(db, "stores", STORE_ID, "config", "floorLayout");
await setDoc(ref, {
  catalog: CATALOG,
  updatedAt: new Date().toISOString(),
  source: "seed",
});
console.log(
  "ok: wrote floorLayout seats=",
  CATALOG.seats.length,
  "grid=",
  `${CATALOG.gridCols}x${CATALOG.gridRows}`,
  "version=",
  CATALOG.version,
);
process.exit(0);
