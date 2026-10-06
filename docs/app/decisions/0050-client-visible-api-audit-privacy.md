# ADR 0050: Client-visible API audit privacy

Date: 2026-10-02. Status: accepted technical implementation; native/owner acceptance open.

## Decision

Safe client transport projections alone cannot prevent authenticated direct API
reads of audit fields on otherwise permitted rows. Replace table SELECT grants
with explicit safe column grants for personal programs, their exercises, workout
instances, workout exercises, set results and shared notes. Remove created_by;
also remove author_user_id and device_id on results and notes. Revoke both table
and sensitive column privileges from PUBLIC, anon and authenticated.

Keep existing RLS and revoked writes. Storage/generated schema types retain audit
columns; transport types expose only selected fields. Trainer personal program
reads use explicit safe projections instead of wildcard rows. Snapshot origin IDs
remain available under the existing contract; this is a narrow audit privacy fix.

Trainer schedule proposals move to an owner-scoped SECURITY DEFINER read RPC with
explicit fields and author_role. It returns pending proposals across all dates,
ordered by proposed time then ID, with pages of at most 500. It validates auth,
workspace ownership and page arguments. PUBLIC/anon cannot execute it. Direct
proposal author_user_id reads are revoked after its app caller migration. Client
proposal reads retain their separate active-card authorization.

Definer command authorization, revision checks, actor-private receipts, immutable
programs and retries remain unchanged. Archived-card direct-table policy and
identity/invitation metadata are outside this patch.

## Verification

See the privacy review checkpoint for fresh permission, command regression,
transport, export and browser results. Owner/native acceptance remains separate.
