/**
 * Set Auth custom claim storeId for a user.
 *
 * Prefers Firebase CLI token (~/.config/configstore/firebase-tools.json).
 * Fallback: FIREBASE_SERVICE_ACCOUNT_PATH or Application Default Credentials.
 *
 * Usage:
 *   npx firebase-tools login   # if needed
 *   npm run firebase:set-store-claim
 *   node scripts/set-store-claim.mjs demo@vvelt.xyz default
 *
 * After setting: sign out / sign in on the app to refresh the ID token.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_ID = "vvelt-portfolio-pos";
const DEFAULT_EMAIL = "demo@vvelt.xyz";
const DEFAULT_STORE = "default";

const email = process.argv[2] || DEFAULT_EMAIL;
const storeId = process.argv[3] || DEFAULT_STORE;

function firebaseToolsConfigPath() {
  // Windows: %USERPROFILE%\.config\configstore\firebase-tools.json (Git Bash / tools)
  // also try APPDATA\configstore
  const candidates = [
    join(homedir(), ".config", "configstore", "firebase-tools.json"),
    process.env.APPDATA
      ? join(process.env.APPDATA, "configstore", "firebase-tools.json")
      : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function setClaimViaFirebaseCliToken() {
  const cfgPath = firebaseToolsConfigPath();
  if (!cfgPath) return false;
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const access = cfg?.tokens?.access_token;
  if (!access) return false;

  async function api(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Identity Toolkit ${res.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
  }

  const lookup = await api(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { email: [email] },
  );
  const users = lookup.users || [];
  if (!users.length) {
    throw new Error(`user not found: ${email}`);
  }
  const uid = users[0].localId;
  let existing = {};
  if (users[0].customAttributes) {
    existing = JSON.parse(users[0].customAttributes);
  }
  existing.storeId = storeId;
  const attrs = JSON.stringify(existing);
  const updated = await api(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    { localId: uid, customAttributes: attrs },
  );
  console.log("using firebase-tools access token");
  console.log(
    "ok:",
    email,
    "uid=",
    uid,
    "claims=",
    updated.customAttributes || attrs,
  );
  return true;
}

async function setClaimViaAdminSdk() {
  const { initializeApp, applicationDefault, cert } =
    await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");

  let sa = null;
  if (existsSync(".env.local")) {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^FIREBASE_SERVICE_ACCOUNT_PATH=(.*)$/);
      if (m) {
        const p = m[1].trim().replace(/^["']|["']$/g, "");
        if (p && existsSync(p)) {
          sa = JSON.parse(readFileSync(p, "utf8"));
        }
      }
    }
  }

  if (sa) {
    initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
    console.log("using FIREBASE_SERVICE_ACCOUNT_PATH");
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    console.log("using applicationDefault credentials");
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const prev = user.customClaims || {};
  const next = { ...prev, storeId };
  await auth.setCustomUserClaims(user.uid, next);
  console.log("ok:", email, "uid=", user.uid, "claims=", next);
}

try {
  const viaCli = await setClaimViaFirebaseCliToken();
  if (!viaCli) {
    await setClaimViaAdminSdk();
  }
  console.log(
    "User must re-login (or force token refresh) to pick up the claim.",
  );
} catch (err) {
  console.error(err?.message || err);
  console.error(
    "\nHint: run `npx firebase-tools login --reauth` then retry.\nOr set FIREBASE_SERVICE_ACCOUNT_PATH / gcloud ADC.",
  );
  process.exit(1);
}
