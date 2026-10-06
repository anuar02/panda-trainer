# ADR 0057: real client purchase read projection

Date: 2026-10-03. Status: accepted technical implementation; screen approval open.

## Context

SOM-33 ledger and typed scoped reads exist. The production client card still shows
an unavailable placeholder for packages. SOM-34 payment policy/transport is pending;
absence of payments from TrainerBilling cannot imply zero received or paid status.
The prototype includes purchase cards but no creation form.

## Decision

Compose a controlled PurchasesPanel into the real client detail route. Read with
user/workspace/client scoped focus hook. Retain every valid scoped purchase,
including expired and depleted ones; per-package used units is original grant
minus current ledger balance, incorporating corrections and penalties.
Fail closed on invalid ledger, orphan credits, currency, money or expiry.
Do not display an invalid projection as a real zero or an empty package list.

Preserve prototype card rows, empty copy and payment-history heading. Price uses
BigInt division/remainder and localized format; expiry is a calendar date formatted
in UTC to avoid device timezone shifts. No floating point conversion of money.
Payment badge/received/header totals remain unknown; payment action is disabled
and history explicitly unavailable. Credit entries are not payment history.
Header aggregation across multiple/expired packages is not invented.

Creation UI is a recorded owner question: entry point/form are absent from the
reference. No dependent creation work until that answer. Existing demo stays intact.

## Evidence and limits

1078 tests / 115 suites and type/lint/format pass, including 6 new domain,
4 controlled panel and 3 real-route tests. All-platform export succeeds.
Six default client reference/app pairs have no errors or missing states and
remain unapproved. Synthetic production browser confirms real values and fresh
usage after an owner-authorized server charge. See
[review](../../../app/review/purchases/README.md).
Native/owner approval, purchase creation, payment/debt and Linear sync remain open.
