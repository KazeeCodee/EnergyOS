# EnergyOS — Email Templates Supabase

Templates HTML estilizados para Supabase Auth. Brand: navy `#163759` + forest `#15caca`.

## Cómo aplicar

1. Supabase Dashboard → **Authentication** → **Email Templates**
2. Por cada template:
   - Copiar contenido del `.html` correspondiente
   - Pegar en editor del template
   - Guardar

## Mapping archivo → template Supabase

| Archivo | Template Supabase |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `magic-link.html` | Magic Link |
| `reset-password.html` | Reset Password |
| `invite-user.html` | Invite user |
| `change-email.html` | Change Email Address |
| `reauthentication.html` | Reauthentication |

## Variables usadas

- `{{ .ConfirmationURL }}` — URL de acción (todos los templates)
- `{{ .Token }}` — código OTP 6 dígitos (magic link)
- `{{ .Email }}` — correo destinatario
- `{{ .NewEmail }}` — solo en `change-email.html`
- `{{ .SiteURL }}` — URL pública del proyecto, usada para `/logo.png`

## Logo

Templates referencian `{{ .SiteURL }}/logo.png`. Verificar:
- `Project Settings → Authentication → Site URL` configurado a dominio prod
- `public/logo.png` accesible vía HTTP en ese dominio

Si logo no carga en cliente correo (Outlook, Gmail bloquea images por default), considerar:
- Subir logo a CDN público con `Content-Type: image/png`
- Reemplazar `{{ .SiteURL }}/logo.png` por URL absoluta en cada template

## Subject lines sugeridos

| Template | Subject |
|---|---|
| Confirm signup | Confirmá tu correo en EnergyOS |
| Magic Link | Tu enlace de acceso a EnergyOS |
| Reset Password | Restablecé tu contraseña de EnergyOS |
| Invite user | Te invitaron a EnergyOS |
| Change Email | Confirmá tu nuevo correo en EnergyOS |
| Reauthentication | Código de verificación · EnergyOS |

## SMTP producción

Default SMTP de Supabase tiene rate limit (~3-4/hora). Para prod configurar SMTP custom:
**Project Settings → Auth → SMTP Settings**. Opciones recomendadas: Resend, Postmark, SES, SendGrid.

## Preview local

Abrir cualquier `.html` directamente en navegador. Variables `{{ .X }}` se ven como literal — normal.
Para preview real con datos, usar herramienta tipo [putsmail.com](https://putsmail.com) o `mjml` watch.

## Compatibilidad

- Layout basado en `<table>` (compatible Outlook/Gmail/Apple Mail)
- CSS inline (no `<style>` external)
- Fonts: Inter + Space Grotesk con fallback system-ui
- Sin background-image, sin flex/grid
- Width fijo 520px desktop, fluid 100% mobile
