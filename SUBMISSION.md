# sitwithme — Devpost draft

## Inspiration

Quiet moments are normal in live streaming, but an empty chat can make the streamer and the people watching feel as if the room has disappeared. We wanted silence to feel shared instead of awkward: a tiny place where viewers can visibly take a seat, and where the room can gently look after itself until conversation returns.

## What it does

sitwithme is a transparent OBS browser overlay built around a cozy pixel room. Viewers type `!sit` to claim an empty chair, `!wave` to greet the room, and `!leave` when they go. Messages from seated viewers appear briefly above their characters.

When chat has been quiet for a configurable amount of time, idle mode begins. Resident characters walk between spots, sit only in unclaimed chairs, stretch, and trade short scripted lines while the fireplace flickers and a cat occasionally stretches. Any new human chat message ends idle mode immediately. A local streamer panel changes the chair count, idle delay, resident names, and room palette without restarting the overlay.

## How we built it

We built sitwithme with Codex, Node.js 20, and TypeScript. The backend connects to Twitch's EventSub WebSocket transport for `channel.chat.message`, uses Twitch's authorization-code OAuth flow, and relays room state to the browser through a local WebSocket. The overlay is a single HTML file rendered with the Canvas API: the room, chairs, pixel characters, speech bubbles, fireplace, and cat are all drawn in code without React. A small local settings API persists configuration and broadcasts changes to connected overlays immediately.

## Challenges

The hardest part was making several timing systems feel like one calm room. Chat bubbles, waves, idle transitions, resident motion, dialogue exchanges, and reconnecting WebSockets all have different lifetimes. We also had to guarantee that residents never displaced a real viewer, and that an incoming message could quiet the residents and move them out within about two seconds. Keeping the overlay transparent, readable at OBS resolutions, and testable without a Twitch connection shaped the fake-chat mode and local debugging APIs.

## What's next

Next we would add more room layouts, accessible font-size controls, optional channel-themed props, and a lightweight import/export flow for settings. We would also like to support more EventSub-driven moments, such as welcoming a first-time chatter or celebrating a returning viewer, while keeping the room deliberately calm rather than turning it into a noisy alert system.

## Three-minute demo video shot list

| Scene | Seconds | What's on screen |
| --- | ---: | --- |
| The quiet-stream problem | 0–15 | Stream layout with the empty transparent pixel room; title card explains that silence can feel awkward. |
| Meet sitwithme | 15–35 | Overlay at 1280×720; quick close-ups of the room, empty chairs, fireplace, and cat. |
| Viewer commands | 35–65 | Fake viewers send `!sit`; characters appear with display names. One sends `!wave`, then a normal message appears in a speech bubble. |
| Streamer panel | 65–100 | Open `/panel`; change chairs from 6 to 8, switch to Night blue, rename residents, save, and show the overlay updating live. |
| Idle mode | 100–135 | Click **Test idle now**; residents walk in, use empty chairs, stretch, and exchange a two-line conversation. Show the cat stretch and fireplace flicker. |
| Chat returns | 135–152 | Send a fake `!sit`; idle ends immediately and residents step back while the viewer keeps the chair. |
| OBS setup | 152–168 | Show Browser Source URL, 1280×720 size, transparent background, and briefly demonstrate `?scale=1.5`. |
| Under the hood | 168–177 | Fast code montage: EventSub WebSocket, TypeScript state machine, Canvas renderer, and tests. |
| Closing | 177–180 | Final cozy room with project name and one-line message: “Make quiet feel shared.” |
