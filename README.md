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

Fake chat seats three sample viewers, exercises `!wave` and normal-message bubbles, pauses for idle mode, and never contacts Twitch.

## Idle mode

After `IDLE_MINUTES` without any human chat message, two or three resident characters enter the room. They walk between spots, stretch, use empty chairs without displacing viewers, and trade short cozy lines. The fireplace and cat also become more active. Any human message ends idle mode immediately; resident speech stops and the residents step back within about two seconds.

Set resident names with a comma-separated list of two or three names:

```env
IDLE_MINUTES=3
RESIDENTS=Mori,Pip,Tabby
```

For a quick idle-mode demo, use a 15-second threshold with fake chat. Fake chat sends a short burst, stays silent long enough for idle mode to appear, then repeats:

```powershell
$env:FAKE_CHAT='1'; $env:IDLE_MINUTES='0.25'; npm start
```

Open `http://localhost:3000/api/state` to inspect the current room, idle flag, timestamps, and resident activity.
