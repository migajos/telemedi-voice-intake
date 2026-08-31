# Telemedi Voice Intake — prototype

A small Expo/React Native prototype exploring whether voice can replace the
pre-consultation intake form in telemedicine. The patient (or a parent,
speaking for a child) describes what's wrong out loud instead of filling in
fields; AI extracts five required pieces of information and shows what's
still missing.

Full product brief: [`CLAUDE.md`](./CLAUDE.md).

## Flow

One screen, a local state machine:

```
setup → context-select → recording → analyzing → results
```

1. **Setup** — enter your ElevenLabs and OpenAI API keys.
2. **Context select** — "Dla mnie" (for myself) or "Dla dziecka" (for my child). This changes the wording of every prompt that follows.
3. **Recording** — record a free-form spoken description; the screen lists the five things worth mentioning, phrased for the chosen recipient.
4. **Analyzing** — two API calls run in sequence (see below).
5. **Results** — a checklist of the five fields (symptoms, duration, temperature, medication, age), each shown as captured or missing, plus the raw transcript for transparency. "Nagraj ponownie" restarts the recording step.

## AI pipeline

Two plain `fetch` calls, no SDKs:

1. **ElevenLabs Scribe v1** (`POST /v1/speech-to-text`) transcribes the recorded audio. Chosen specifically for Polish transcription quality, since the target users are Polish-speaking patients.
2. **OpenAI Chat Completions** (`gpt-4o-mini`, JSON mode) extracts the five structured fields from the transcript, told explicitly whether the transcript describes the patient or their child. It is prompted to extract only what was actually said — no diagnosis, no medical advice.

Real-time/incremental completeness feedback was deliberately cut in favor of one reliable batch analysis after recording stops — see the "Product hypothesis" and "Constraints" sections of `CLAUDE.md` for why.

## API keys

The assessment requires that end users supply their own API keys rather than
the app shipping with a bundled key. Keys are entered on the setup screen and
held only in React state for the current app session — never written to
`AsyncStorage`, `SecureStore`, disk, or any env var. Closing or reloading the
app clears them.

**Known limitation, by design:** with keys held client-side, the app calls
ElevenLabs and OpenAI directly from the device — acceptable for this
prototype, but not how this would ship. A production version would keep
provider keys server-side entirely and have the client authenticate against
a backend that either proxies these calls or hands out short-lived, scoped
credentials per request, so a compromised or intercepted client never has
access to a long-lived provider key.

## Running it

```bash
npm install
npx expo start
```

Open in Expo Go on a device/simulator (recording requires a real microphone,
so the iOS Simulator's simulated mic or a physical device works best). On
first launch you'll be asked to grant microphone access — required to record
the intake description.

## What's out of scope

Editing/correcting extracted fields, persisting any patient data, multi-turn
re-prompting to fill specific gaps, and diagnosis or medical advice of any
kind — all intentionally excluded per the assessment's constraints.
