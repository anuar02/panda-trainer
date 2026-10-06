# ADR 0051: Connected action sheet stacking

Date: 2026-10-02. Status: accepted technical implementation; native/owner acceptance open.

## Decision

Connected trainer reschedule editors and client action confirmations/editors use
push stacking above the selected booking detail. The Sheet wrapper forwards an
optional stackBehavior; all other consumers keep the library default.

A browser trace reproduced the parent switch/minimize transition finishing after
an editor opened, followed by parent dismissal and selected-booking cleanup. That
unmounted both sheets before submission, with no API call or browser error. Push
avoids minimizing the selected detail while its child action is open. The same
parent/child relationship exists in connected client controls, including their
cancellation confirmation.

No layout, strings, command permissions or demo defaults change. Verify the
selected booking remains available through child editing and closing, then run
trainer/client browser actions against the restricted API. Native and owner
acceptance remain separate.

## Verification checkpoint

41 focused tests, TypeScript, lint and formatting pass. Full app check passes
962 tests / 106 suites. Configured export and fresh trainer/client browser checks
are pending; the earlier failing trace is a diagnostic, not acceptance evidence.

Final continuation: configured web/iOS/Android export passes. Trainer runtime
passes 23 checks and client runtime passes 34 checks. Full app check passes
991 tests / 107 suites, TypeScript, lint and formatting. Native sheet interaction
and owner acceptance remain open.
