import {
  buildAgentEndpoint,
  buildAgentHeaders,
  buildAgentUrl,
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
  buildAgentEndpoint("http://localhost:3100/", "/advisor/chat"),
  "http://localhost:3100/advisor/chat",
  "advisor chat endpoint builder should support persistent chat route",
);

assertEqual(
  buildAgentUrl("http://localhost:3100/", "/advisor/conversations", { nemo: "ACINVCSZ" }),
  "http://localhost:3100/advisor/conversations?nemo=ACINVCSZ",
  "advisor conversations endpoint should support query params",
);

assertEqual(
  buildAgentUrl("http://localhost:3100/", "/advisor/conversations/abc/messages", {
    companyId: "company-1",
    nemo: "ACINVCSZ",
  }),
  "http://localhost:3100/advisor/conversations/abc/messages?companyId=company-1&nemo=ACINVCSZ",
  "advisor messages endpoint should support scoped query params",
);

assertEqual(
  buildAgentUrl("http://localhost:3100/", "/advisor/memory/mem-1", { nemo: "ACINVCSZ" }),
  "http://localhost:3100/advisor/memory/mem-1?nemo=ACINVCSZ",
  "advisor memory endpoint should support item routes",
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
