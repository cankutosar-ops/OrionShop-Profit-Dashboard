# LAN development access

Use this when opening the OrionShop dev server from another device on the same Wi‑Fi / LAN (MacBook, iPad, phone, second PC).

## Start

```bash
npm run dev
```

The launcher:

- Binds to `0.0.0.0` (all interfaces) so LAN clients can connect
- Auto-detects local IPv4 addresses and configures Next.js `allowedDevOrigins`
- Prints Local and LAN URLs in the terminal

Example:

```text
✓ Starting Next.js on 0.0.0.0:3000 (distDir=.next-dev)
✓ Local:   http://localhost:3000
✓ LAN:     http://192.168.0.111:3000
```

Open the **LAN** URL on the other device (same network). Prefer the IPv4 address shown in the terminal — do not use `localhost` on the remote device.

## Why this is required

Next.js 15 blocks cross-origin requests to `/_next/*` in development unless the browser origin is allowlisted. Accessing via a LAN IP is a different origin from `localhost`, which otherwise breaks App Router navigation (`Link`, `router.push` / `replace` / `refresh`), filters, and sidebar.

Production (`next build` / `next start`) is unchanged.

## IP address changes

LAN IPs are discovered at **dev server start**. If your PC gets a new DHCP address:

1. Stop the dev server
2. Run `npm run dev` again
3. Use the new LAN URL printed in the terminal

Optional override (comma-separated hosts):

```bash
# Windows PowerShell
$env:ALLOWED_DEV_ORIGINS="192.168.0.111,10.0.0.5"; npm run dev
```

## Firewall (Windows)

If the LAN page does not load at all (connection refused / timeout), allow inbound TCP on the dev port (default **3000**):

1. Windows Security → Firewall & network protection → Allow an app through firewall  
   **or**
2. PowerShell (Admin):

```powershell
New-NetFirewallRule -DisplayName "OrionShop Next.js Dev" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

macOS / Linux: allow the Node process or port 3000 in the system firewall if LAN clients cannot connect.

## Checks

From the other device:

- Dashboard loads
- Sidebar navigation works
- Date / marketplace / brand filters update the URL and data
- Smart Pricing and Reports open without hanging loaders

If the first HTML paint works but clicks hang, confirm the terminal shows your current LAN IP under `allowedDevOrigins` and that you restarted `npm run dev` after a network change.
