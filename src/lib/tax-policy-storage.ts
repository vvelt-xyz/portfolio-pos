import {
  DEFAULT_TAX_POLICY,
  migrateTaxPolicy,
  type TaxPolicy,
} from "@/domain/tax-policy";

const STORAGE_KEY = "pos_v1_tax_policy";

export function loadTaxPolicyLocal(): TaxPolicy {
  if (typeof window === "undefined") return DEFAULT_TAX_POLICY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TAX_POLICY;
    return migrateTaxPolicy(JSON.parse(raw));
  } catch {
    return DEFAULT_TAX_POLICY;
  }
}

export function saveTaxPolicyLocal(policy: TaxPolicy): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
}
