# SOM-33: real client purchase cards

Date: 2026-10-03. Branch: `fix/som-50-template-picker`.
Implementation progress, not screen acceptance or completed SOM-33/SOM-34.

## Delivered

Production client route composes scoped PurchasesPanel using the focus billing hook.
Canonical purchase title/Стоимость/Получено/Занятий/Срок rows and payment-history
heading are preserved. Cost is exact KZT minor money; used units incorporate
restoration and separate penalties. Expired/depleted packages remain visible.
Invalid ledger, orphan credit, price/currency/expiry or read failure exposes retry,
not fabricated zeros. Loading and real empty data are distinct.
Payment badge/received/debt are unknown; payment action disabled, history unavailable.
Creation has no prototype form and waits for the recorded owner decision.

## Verification

- `app/npm run check`: **1078 tests / 115 suites**, strict typecheck/lint/format.
  New coverage: 6 domain, 4 panel, 3 production route tests.
- `npm run export`: web/iOS/Android succeeds. Schema unchanged in this package.
- `SCREENS=t-client node scripts/parity.mjs`: **6 reference + 6 app captures**, no
  missing comparisons or browser errors, 390×844@2x, accepted false.
  Captures under `parity/generated` demonstrate preserved default client states,
  not production package approval.
- Local headless synthetic browser: clients list → real client → «Оплаты»;
  package cost1200 KZT, units2/used0 and expiry3 Oct correctly loaded from API.
  One real owner-authorized `mark_attended` RPC charge followed by returning to
  clients/reopening card changes usage to1; payment button remains disabled.
  Peer client with no purchases shows canonical empty state and no foreign package.
  Local review screenshot: `output/playwright/client-purchases.png` (not committed).

A direct UUID-route URL initially returned404 from the minimal temporary static
HTTP server; actual app client-list navigation succeeds. This was server routing,
not an application assertion. Favicon404 is also local diagnostic noise.
Temporary synthetic fixtures/auth state are removed after checks; no real data used.

## Open acceptance

Native screenshots/behavior, owner approval and SOM-47 acceptance remain open.
Live Linear unavailable and not updated. Payment/overpayment and creation questions
are in `docs/app/OPEN-QUESTIONS.md`. Header aggregate remains unknown.
