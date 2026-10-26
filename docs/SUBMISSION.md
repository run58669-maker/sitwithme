# Devpost submission text

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
