# EnergyOS

Sistema web de EnergyOS construido con React, TypeScript, Tailwind CSS, Recharts y datos locales en JSON.

## Ejecutar

```bash
npm install
npm run dev
```

Abrir `http://127.0.0.1:5173/`.

## Build

```bash
npm run build
```

## Captura de leads

El formulario de contratación usa `VITE_LEADS_ENDPOINT` si está configurado. Podés crear un `.env.local` con:

```bash
VITE_LEADS_ENDPOINT=https://tu-endpoint-de-tally-o-formspree
```

Si no hay endpoint, el flujo guarda la solicitud en `localStorage` para poder probar la experiencia completa.
