# Dropin

demo video: https://youtu.be/vAfNqrrJtQE

Dropin takes one vehicle home. Operators bid a quote for the whole vehicle. Passengers hold seats, and the split is that quote divided by the seats actually held.

The demo route is Bengaluru to Mangaluru, 24 December 2026, night departure.

The npm package and the local data folder are named `ghardrop`.

## What is different

- Operators compete with whole-vehicle bids. The group picks. The fare falls as more seats are held.
- Capacity comes from the vehicle. A 12-seat tempo holds 12. The 13th seat fails.
- Amma is a family milestone link. It is not live GPS.
- Crewmark keeps a drop inside a college or a company.

## Revenue plan

Dropin takes 8% of the vehicle offer from escrow when the ride completes. The rest is the driver's.

Lock-in is the window. Each passenger pays into escrow when a driver is selected. The money is held there and is not given to the driver yet. Cancel before lock-in and the refund is full. Cancel after lock-in and a percentage of that same escrow goes to the driver, which stops last-minute drop-outs. The driver is paid only after the ride is completed, so passengers are protected if the driver does not show up.

The app records the seat commitment. The 8% above is the revenue plan.

## Crewmark

Crewmark is how a traveller keeps a drop inside their organisation.

1. The email domain is classified immediately. Free and disposable webmail stays Tier 1 and is not a Verified Peer. `.edu`, `.edu.in`, `.ac.in`, and seeded Bengaluru campus domains are academic. Any other organisational domain is a work badge. `ghardrop.dev` is the demo organisation, Dropin.
2. A 6-digit code is sent to that email. Typing the address is not enough. Set `SMTP_URL` to send it. When `SMTP_URL` is empty, or `CREWMARK_DEMO_OTP=1`, the code is returned once to the signed-in session and is not written to logs.
3. Tier 1 can browse drops and use reality check, and cannot hold a seat in a restricted room. Tier 2, a verified college or work email, can join and create Campus, Tech park, or Verified Peer rooms. Tier 3 is the ID layer: DigiLocker or Aadhaar, or a driving licence, plus LinkedIn. A room can require it. This build does not run that check.

The passenger flow has a Crewmark control on the drop. The seeded passengers are Verified Peers of Dropin, so the open Mangaluru drop still works.

## Sponsors

**Sarvam** does the speech. Hold to speak uses Saaras speech-to-text. Hear this route and Amma use Bulbul text-to-speech, including Kannada and Telugu. The screen stays English.

**Flagsmith** is read with the server environment key. Identity flags set the session. `voice_first` opens the mic. The admin snapshot source is `flagsmith`. If a flag is missing, the safe default stays on: voice on, bidding on, writes open.

**NudgeBee** is connected. Failed seat holds and the labelled capacity drill are sent to NudgeBee. The booking-health desk shows Delivered.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, copy the example file:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000.

Names in `.env.example`, with no values committed:

| Name | Where it is used |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Empty uses local Postgres. |
| `NEXT_PUBLIC_SUPABASE_URL` | Realtime subscription. Polling still updates the room. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Realtime subscription. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key. |
| `SARVAM_API_KEY` | Server-only speech-to-text and Bulbul speech. |
| `FLAGSMITH_SERVER_KEY` | Server-only Flagsmith environment key. |
| `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY` | Flagsmith environment key used when the server key is absent. |
| `FLAGSMITH_API_TOKEN` | Flagsmith API token for the pause flag. |
| `FLAGSMITH_PAUSE_FEATURE_STATE_ID` | Feature state id for `booking_writes_paused`. |
| `OPS_ACTION_SECRET` | Header `x-ops-secret` for the pause endpoint. |
| `NUDGEBEE_WEBHOOK_URL` | NudgeBee webhook for failed seat holds and the labelled capacity drill. |
| `NUDGEBEE_API_TOKEN` | NudgeBee API token. |
| `NUDGEBEE_BASE_URL` | NudgeBee base URL. Defaults to `https://app.nudgebee.com`. |
| `SESSION_SECRET` | Signs the session cookie. |
| `SMTP_URL` | Sends the Crewmark code. |
| `SMTP_FROM` | From address for that code. |
| `CREWMARK_DEMO_OTP` | Set to `1` to return the Crewmark code in the session response. |

Do not put Sarvam, Flagsmith, Supabase, NudgeBee, or SMTP secrets in client code. `.env.local` is gitignored.

With `DATABASE_URL` empty, the app creates a local Postgres database in `.data/ghardrop` and runs the SQL in `supabase/migrations` plus `supabase/seed.sql`.

## Demo accounts

The passwords are also in the demo switcher.

| Person | Email | Password |
| --- | --- | --- |
| Ravindranath, passenger | passenger@ghardrop.dev | passenger123 |
| Imad, passenger | passenger2@ghardrop.dev | passenger123 |
| Coastal Tempo Co. | operator@ghardrop.dev | operator123 |
| Malnad Travels | operator.malnad@ghardrop.dev | operator123 |
| Dropin Ops | admin@ghardrop.dev | admin123 |

These are labelled sample operators. A verified operator badge is not a live permit check.


## Flagsmith flags

- Boolean: `voice_trip_search`, `operator_voice_bid`, `amma_mode`, `vibe_filters`, `corridor_pickup`, `reality_check`, `christmas_drop_mode`, `booking_writes_paused`
- String: `voice_launch_experiment` with `voice_first` and `text_first`
- Remote config `pool_config` with vehicle thresholds, `minimum_confirmation_ratio` of 0.75, currency INR, and night as the default departure

`minimum_confirmation_ratio` decides when a held seat can become a confirmed booking. It does not change vehicle capacity.

## Checks

```bash
npm test
```

Pricing, the trip and bid parsers, Crewmark domain rules, and the Postgres `commit_booking` function are covered. The function is idempotent and will not put another seat into a full vehicle.
