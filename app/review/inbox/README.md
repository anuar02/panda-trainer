# Trainer inbox — 30 September 2026

Implemented `/inbox` from `prototype-fresh` using shared scheduling requests.
Active requests support accept, decline, counterproposal and withdraw; resolved
requests appear in history. Today opens this route even with zero pending replies.
Local demo only, under ADR 0018. **Visual parity is not accepted.**

Verification:

- `npm run export`: Android/iOS/web succeeded, 44 static routes.
- `npm run check`: 310 tests / 41 suites; TypeScript, ESLint and formatting pass.
- Four provider-backed inbox tests cover acceptance/decline isolation and remount,
  counterproposal/withdraw without early session movement, read failure/retry and
  write failure/retry. Existing domain tests cover stale revisions and permissions.
- Browser: accepted r1, declined r2, reloaded; both history entries and the empty
  state persisted. Screenshot: `output/playwright/inbox-wave/resolved-reloaded.png`.
- iOS iPhone 16e: route opened, trainer dark theme, safe area and cards inspected.
  Screenshot: `output/playwright/inbox-wave/ios-inbox.png`. Expo dev overlay visible.
- No Android emulator attached. Keyboard, VoiceOver, large text and physical-device
  behavior have not been accepted.

Final capture: six references, six app captures, zero missing comparisons and
zero runtime errors. Comparison uses six pairs (auto normal/empty/loading/offline, explicit dark/light)
under `../foundation-parity/parity/generated/index.html`. The prototype retains
requests in every demo scenario; real empty state follows request resolution.
Generated screenshots are local artifacts and may not exist in a clone.

- [x] Canonical copy and active-card block order transferred.
- [x] Typography, spacing, colors and avatar gradients taken from specs/source.
- [x] Original icons and shared Card/Button/StatusPill/Mascot used.
- [x] Normal and resolved-history browser flows exercised.
- [ ] Shared web primary-button gradient clipping and exact shadows accepted.
- [ ] Native counterproposal sheet parity, date picker and motion accepted.
- [ ] Android, accessibility and large-text checks completed.
- [ ] Owner visual approval.

The shared Button has visible web gradient clipping at its lower rounded corners;
the iOS capture does not show that artifact. Existing Sheet layout remains a known
gap. Timestamp copy follows the prototype's fixed demo convention (08:41 seed,
“только что” after edits), not a production event log. Five deep routes remain:
template, invite, billing, welcome and first.
