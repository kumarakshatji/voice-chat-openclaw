# OpenClaw Voice Call

A browser-based, hands-free voice interface for OpenClaw. Start a call, speak
naturally, and the app transcribes your turn, gets an OpenClaw response, speaks
it aloud, then resumes listening.

## Requirements

- Node.js 18 or later
- A working local OpenClaw installation and configured model provider
- Chrome or Edge for browser speech recognition

## Run Locally

1. Start the local OpenClaw Gateway service:

   ```bash
   openclaw gateway start
   ```

2. Confirm it is reachable:

   ```bash
   openclaw gateway status
   ```

3. Start the voice UI:

   ```bash
   npm start
   ```

4. Open http://localhost:3000 in Chrome.
5. Select **Start call** and allow microphone access.
6. Speak. The app automatically sends the completed utterance to OpenClaw,
   reads the reply aloud, and returns to listening. Select **End call** to stop.

The local server calls OpenClaw through the running Gateway:

```bash
openclaw agent --json --message "..."
```

If the Gateway is not installed as a service, use `openclaw gateway run` in a
separate terminal instead.

## Browser Notes

Speech input uses the Web Speech API and response playback uses browser speech
synthesis. Chrome on `localhost` is the supported development path. Brave's
privacy controls can cause Speech Recognition `network` errors even when the
computer has internet access.

Or point the website at a remote OpenClaw-compatible HTTP endpoint:

```bash
OPENCLAW_URL="https://your-openclaw-endpoint" npm start
```

Optional, if OpenClaw needs bearer auth:

```bash
OPENCLAW_API_KEY="your-key" OPENCLAW_URL="https://your-openclaw-endpoint" npm start
```

## Remote Request Contract

The local server sends this to `OPENCLAW_URL`:

```json
{ "message": "user speech or typed text" }
```

It can read common response shapes such as:

```json
{ "response": "..." }
{ "text": "..." }
{ "message": "..." }
{ "answer": "..." }
```

If OpenClaw uses a different schema, update `extractText` or the upstream request body in `server.js`.
