import {
  getPremiumModuleCopy,
  isTrialAllowedAppPath,
  premiumRedirectForTrial,
} from "./trialAccess.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(isTrialAllowedAppPath("/app"), true, "trial can access home");
assertEqual(isTrialAllowedAppPath("/app/ajustes"), true, "trial can access settings");
assertEqual(isTrialAllowedAppPath("/app/mercado"), false, "trial cannot access premium modules");
assertEqual(isTrialAllowedAppPath("/app/analizador"), false, "trial cannot access analyzer directly");

assertEqual(
  premiumRedirectForTrial("/app/analizador"),
  "/app?premium=analizador",
  "analyzer route should redirect trial users to home with upsell key",
);

assertEqual(
  premiumRedirectForTrial("/app/mercado"),
  "/app?premium=mercado",
  "premium route should redirect trial users to home with upsell key",
);

assertEqual(
  premiumRedirectForTrial("/app/ajustes"),
  null,
  "settings should not redirect",
);

assertEqual(
  getPremiumModuleCopy("auditoria-dte")?.title,
  "Auditoria DTE",
  "premium copy should describe the requested module",
);
