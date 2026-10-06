# Quantum Rim Discord Activity

Quantum Rim now follows the same Activity authentication shape as Quantum Dash:

1. The browser waits for the Embedded App SDK `ready` event.
2. It requests an `identify` authorization code from Discord.
3. `POST /api/auth/discord/exchange` exchanges that one-time code on the server.
4. The browser gives the returned access token to `commands.authenticate` once.
5. Quantum Rim stores only its signed app-session token in `sessionStorage`. The Discord access token and client secret are never persisted in the browser.

The web game remains playable outside Discord. Discord initialization only runs when Discord supplies a `frame_id` launch parameter.

## Two games in the Vektre Labs Discord

The recommended setup is **two Discord applications**, one for Quantum Dash and one for Quantum Rim. That produces two distinct Activity tiles in the Vektre Labs Discord while keeping the games independently deployable. Use the same environment-variable **names** in both repositories, but put the Quantum Rim application's own Application ID and client secret in this repository.

Reusing Quantum Dash's literal Application ID and secret is also supported, but Discord will treat that as one Activity, not two separate games. A single-app deployment needs a launcher and path-based URL mappings for `/dash` and `/rim`; the more specific routes must also own their asset paths. Do not point two `/` mappings at different games.

## Environment

Copy `.env.example` to `.env.local` for development. These names intentionally match Quantum Dash:

```dotenv
VITE_DISCORD_CLIENT_ID=<quantum-rim-application-id>
VITE_API_BASE_URL=
DISCORD_CLIENT_ID=<same-quantum-rim-application-id>
DISCORD_CLIENT_SECRET=<server-only-secret>
DISCORD_REDIRECT_URI=
SESSION_SECRET=<optional-separate-signing-secret>
SESSION_TTL_HOURS=168
ALLOWED_ORIGINS=http://localhost:5173,https://<quantum-rim-host>
PORT=3002
```

Only `VITE_DISCORD_CLIENT_ID` and `VITE_API_BASE_URL` are public. Never create `VITE_DISCORD_CLIENT_SECRET` or put either server secret in Vercel's client build settings.

`DISCORD_REDIRECT_URI` stays blank for an Embedded App SDK code exchange. A normal website callback URL is a different OAuth flow.

## Local development

```powershell
Copy-Item .env.example .env.local
npm run dev
```

That starts the Vite game on `http://localhost:5173` and its local Discord API on `http://localhost:3002`; Vite proxies `/api` to the companion API. For an actual Discord launch, expose the Vite origin with an HTTPS tunnel and temporarily target that origin in the Activity URL Mapping.

Useful checks:

- `GET /api/health` reports whether Discord is configured.
- A direct browser visit should not show the Discord status pill.
- An Activity launch should show `Discord · <display name>` after authentication.
- `npm test`, `npm run lint`, and `npm run build` must pass before deployment.

## Discord Developer Portal

1. Create or select the **Quantum Rim** application.
2. Under **Activities → Settings**, enable Activities.
3. Under **Activities → URL Mappings**, map `/` to the deployed Quantum Rim HTTPS origin.
4. Use only the `identify` OAuth scope for this integration.
5. Leave normal OAuth2 website redirect URLs out of the Activity flow.
6. Add the application to the Vektre Labs Discord as a development Activity, then launch it in a voice channel, text channel, or DM.

The application cannot be enabled until it has a URL Mapping. The checked-in Vercel configuration allows Discord to frame the site.

## Vercel

The repository's `api/` directory contains the server-side exchange, session verification, and health functions. Set these server-side environment variables in the Vercel project:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET` (recommended, but optional)
- `SESSION_TTL_HOURS`
- `ALLOWED_ORIGINS`
- `VITE_DISCORD_CLIENT_ID` at build time

Leave `VITE_API_BASE_URL` blank when the Vercel functions and game share an origin. If the API is deployed elsewhere, set it to that HTTPS origin and include the game plus Discord proxy origins in `ALLOWED_ORIGINS`.

## Security properties

- The client secret is read only in server code.
- App sessions are HMAC-signed, expire, and reject tampering.
- Only the Discord user ID, display name, username, and avatar hash are retained in the signed session.
- No email, guild list, message, IP, or bot scope is requested or stored.
- The response policy permits Discord Activity iframes without weakening script or network policy with a broad CSP.
