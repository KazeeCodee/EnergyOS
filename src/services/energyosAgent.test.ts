import {
  buildAgentEndpoint,
  buildAgentHeaders,
  getAgentHttpErrorMessage,
  hasEnergyosAgentConfig,
} from "./energyosAgent.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(
  hasEnergyosAgentConfig("http://localhost:3100"),
  true,
  "configured agent URL should be detected",
);

assertEqual(hasEnergyosAgentConfig(""), false, "empty agent URL should be treated as missing");

assertEqual(
  buildAgentEndpoint("http://localhost:3100/", "/agent/ask"),
  "http://localhost:3100/agent/ask",
  "agent endpoint builder should avoid double slashes",
);

assertEqual(
  buildAgentEndpoint("http://localhost:3100/", "/advisor/tasks/approve"),
  "http://localhost:3100/advisor/tasks/approve",
  "advisor task endpoint builder should support v2 routes",
);

assertEqual(
  buildAgentHeaders("abc.def.ghi").Authorization,
  "Bearer abc.def.ghi",
  "agent headers should include Supabase JWT as Bearer token",
);

assertEqual(
  getAgentHttpErrorMessage(401),
  "Sesion expirada o token no valido. Volve a iniciar sesion para usar EnergyOS Advisor.",
  "401 should map to an authentication message",
);

assertEqual(
  getAgentHttpErrorMessage(403),
  "No tenes permisos para consultar este Data Room con el agente.",
  "403 should map to an authorization message",
);

assertEqual(
  getAgentHttpErrorMessage(500),
  "La API de EnergyOS Advisor devolvio un error interno. Proba nuevamente en unos minutos.",
  "500 should map to a safe server error message",
);
