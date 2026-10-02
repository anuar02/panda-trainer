# SOM-35: invitation to existing finished history

2026-10-02. Synthetic local headless verification passes all 43 checks; native and owner
acceptance remain open.

The runner creates an unlinked card and finished journal before the new client's
Auth registration. The trainer issues a real invitation through the app. The client
opens that link, completes email OTP and explicitly accepts it, then reads the
original card's program/history/progress. It checks unchanged stored IDs and
history, finished/draft/private/peer isolation, positive safe history API projections, same-user invitation replay and
another claimant's neutral rejection. Scheduling actions also run on that card.

Use an isolated stack and an export configured with its Supabase values and
`EXPO_PUBLIC_INVITATION_BASE_URL=https://127.0.0.1:8088`. Static production
exports require HTTPS invitation URLs. The runner extracts the synthetic token
and reconstructs an HTTP loopback URL for its local preview; it does not weaken
the production URL validator. Use Expo export with `--clear` when changing this value so the transformed bundle
contains the HTTPS base. The preview must resolve
exported dynamic invitation, workspace card and connection paths.

```sh
node app/review/invitation-history/verify.cjs \
  --workdir /path/to/isolated/workdir \
  --container supabase_db_trainerApp-som18 \
  --origin http://127.0.0.1:8088
```

All data is synthetic and cleanup is scoped to generated fixture identities.
A browser pass does not establish native deep-link/domain/share or owner screen
acceptance. No Linear updates, production data, push or release are performed.

## Runtime evidence — 2026-10-02

The corrected configured production export passes 43 headless Chrome checks.
Actual trainer invitation issuance, new client OTP signup and explicit acceptance
link the original card without changing preexisting finished journal IDs or
revision. Own program/history/progress show stored values, distinguish zero from
unrecorded sets and exclude peer, draft and private notes. Positive captured API
responses expose own values without creator/author Auth IDs or device fields.
Same-user invitation replay returns the original card; another signed-in account
receives neutral rejection and cannot reassign it. Account switching hides the
card. No browser errors occurred; scoped database/Auth/mail cleanup succeeded.

The runner tolerates response bodies discarded by navigation while still requiring
positive rows for every history table. A new claimant tab explicitly signs in if
its session is absent. Screenshots: `history-detail.png` and `progress.png` under
`/tmp/screens/invitation-history/`. These checks do not establish native
deep-link/domain/share, accessibility, two-phone or owner screen acceptance.
