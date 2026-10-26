# sitwithme

An OBS overlay for quiet Twitch streams: viewers !sit in a pixel room; when chat goes silent, the room's residents keep it alive. Built with OpenAI Codex for the Codex x TwitchCon Hackathon 2026.

## Run locally

Requirements: Node.js 20 or newer and a Twitch application whose OAuth redirect URL is exactly `http://localhost:3000/callback`.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL`, and `TWITCH_BOT_USER`. The bot account must be able to join the channel.

3. Start the app:

   ```sh
   npm start
   ```

4. Open `http://localhost:3000/auth` once and authorize the Twitch account used as the bot. The requested scopes are `user:read:chat`, `user:bot`, and `channel:bot`. The resulting user token is stored locally in `.tokens.json`, refreshed automatically, and ignored by Git.

5. Add `http://localhost:3000/overlay.html` as an OBS browser source with a transparent background. Chat commands are `!sit`, `!leave`, and `!wave`.

For development with automatic restart, run `npm run dev`.

### Test without Twitch

Set `FAKE_CHAT=1` in `.env`, or launch it for one PowerShell session:

```powershell
$env:FAKE_CHAT='1'; npm start
```

Fake chat seats three sample viewers, exercises `!wave` and `!leave`, and never contacts Twitch.
