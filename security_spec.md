# LayarMini Firestore Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants

1. **Public Read-Only Streaming vs. Verified Admin Writes**:
   - Viewers (signed out or signed in non-admin) may read (`get` / `list`) ONLY documents where `published == true` in `/series/{seriesId}` and `/series/{seriesId}/episodes/{episodeId}`, plus the singleton marker `/catalogMeta/state`.
   - ONLY a verified admin (`request.auth.token.email_verified == true` matching the bootstrapped primary admin `ahmadhakim3278@gmail.com` or an existing `/admins/{request.auth.uid}` document) may `create`, `update`, or `delete` catalog series, episodes, or catalog metadata.
2. **Master Gate Relational Integrity**:
   - Every episode write under `/series/{seriesId}/episodes/{episodeId}` MUST confirm the parent `/series/{seriesId}` document exists (or exists in the same atomic batch via `existsAfter` during initial batch publish) and that `incoming().seriesId == seriesId`.
3. **Zero Unbounded Lists & Strict Field Boundaries**:
   - Episodes are stored in a subcollection, never an unbounded array on `/series/{seriesId}`.
   - `cast` is bounded to `<= 15` strings; `subtitles` is bounded to `<= 40` subtitle maps.
   - Every string field enforces an explicit `.size()` limit matching `firebase-blueprint.json` verbatim.
4. **Immutable & Server-Verified Temporal Integrity**:
   - `id`, `seriesId`, and `createdAt` are immutable after creation.
   - `createdAt == request.time` on `create`; `updatedAt == request.time` on both `create` and `update`.
   - `updatedByUid == request.auth.uid` on every write.
5. **PII Isolation & Anti-Privilege-Escalation**:
   - No PII (`email`, `phone`, `address`) is stored in publicly readable collections.
   - `/admins/{adminUid}` cannot be listed (`allow list: if false`) and can only be written by the verified bootstrapped primary admin. Self-assignment of admin roles is strictly blocked.

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)

1. **D1 — Anonymous Catalog Injection (Unauthenticated Write)**:
   `POST /series/hacked-drama` with `auth: null`, valid `DramaSeries` body.
   -> Rejected by `isSignedIn()` + `isAdmin()`.
2. **D2 — Non-Admin Authenticated Series Creation (Privilege Escalation)**:
   `POST /series/user-drama` with `auth: { uid: "viewer1", email: "viewer@example.com", email_verified: true }`.
   -> Rejected by `isAdmin()`.
3. **D3 — Spoofed Admin Email with `email_verified: false` (Email Spoofing)**:
   `POST /series/spoofed` with `auth: { uid: "attacker", email: "ahmadhakim3278@gmail.com", email_verified: false }`.
   -> Rejected because `isBootstrappedAdmin()` strictly enforces `request.auth.token.email_verified == true`.
4. **D4 — Shadow / Ghost Field Injection (Shadow Update)**:
   Admin `POST /series/senja` including an undeclared field `"isVerified": true` or `"__proto__": {}`.
   -> Rejected by `data.keys().hasOnly(...)` inside `isValidSeries(incoming())`.
5. **D5 — Path Variable ID Poisoning (1.5 KB Junk ID)**:
   Admin `PUT /series/<1500-char-invalid-id>` or `/series/bad$id/episodes/ep!1`.
   -> Rejected by `isValidId(seriesId)` / `isValidId(episodeId)` (`size() <= 128 && matches('^[a-zA-Z0-9_\\-]+$')`).
6. **D6 — Identity Spoofing (`updatedByUid` Mismatch)**:
   Admin (`uid: "adminA"`) writes `{ updatedByUid: "otherUid", ... }`.
   -> Rejected by `data.updatedByUid == request.auth.uid`.
7. **D7 — Client-Forged Timestamps (Temporal Poisoning)**:
   Admin writes `{ createdAt: Timestamp(2020-01-01), updatedAt: Timestamp(2020-01-01) }` instead of `serverTimestamp()`.
   -> Rejected by `incoming().createdAt == request.time && incoming().updatedAt == request.time`.
8. **D8 — Immutable Field Mutation on Update**:
   Admin updates `/series/senja` changing `id` or `createdAt`, or updates `/series/senja/episodes/ep-1` changing `seriesId`.
   -> Rejected by `incoming().id == existing().id`, `incoming().createdAt == existing().createdAt`, and `affectedKeys().hasOnly(...)`.
9. **D9 — Value & Array Overflow Poisoning (Denial of Wallet)**:
   Admin creates a series with `synopsis` > 1200 chars, or `cast` array of 20 items, or `cast[0]` = `12345` (non-string), or `accentTint` = `"red"` (fails `^#[0-9a-fA-F]{6}$`).
   -> Rejected by `isValidSeries()` / `isValidEpisode()`.
10. **D10 — Orphaned Episode Creation (Broken Master Gate)**:
    Admin creates `/series/non-existent-series/episodes/ep-1` where parent `/series/non-existent-series` does not exist.
    -> Rejected by `existsAfter(/databases/$(database)/documents/series/$(seriesId))`.
11. **D11 — Self-Assigned Admin Elevation (`/admins/{uid}`)**:
    Regular signed-in user (`uid: "u1"`) creates `/admins/u1` with `{ uid: "u1", role: "admin", grantedByUid: "u1", createdAt: request.time }`.
    -> Rejected because `/admins/{adminUid}` write requires `isBootstrappedAdmin()`.
12. **D12 — Unauthorized Draft / Admin Enumeration (`list` Query Trust Violation)**:
    Public viewer runs unfiltered `collection(db, 'series')` (without `where('published', '==', true)`) to scrape unpublished drafts, OR runs `collection(db, 'admins')`.
    -> Rejected because `series` list requires `resource.data.published == true || isAdmin()`, and `admins` sets `allow list: if false;`.

---

## 3. Red Team Audit Matrix (Phase 5)

| Collection | Shadow Update | Email Spoofing | PII Blanket | Query Trust (`list`) | Identity Spoofing | Value Poisoning | Status |
|---|---|---|---|---|---|---|---|
| `/series/{seriesId}` | Blocked (`hasOnly` + `affectedKeys`) | Blocked (`email_verified == true`) | No PII stored | Enforces `resource.data.published == true \|\| isAdmin()` | Blocked (`updatedByUid == request.auth.uid`) | Blocked (`isValidSeries` on create & update) | PASS |
| `/series/{seriesId}/episodes/{episodeId}` | Blocked (`hasOnly` + `affectedKeys`) | Blocked (`email_verified == true`) | No PII stored | Enforces `resource.data.published == true \|\| isAdmin()` (zero `get()`) | Blocked (`updatedByUid == request.auth.uid`) | Blocked (`isValidEpisode` on create & update) | PASS |
| `/catalogMeta/{metaId}` | Blocked (`hasOnly` + `affectedKeys`) | Blocked (`email_verified == true`) | No PII stored | `allow list: if false` (`get` only for `metaId == 'state'`) | Blocked (`updatedByUid == request.auth.uid`) | Blocked (`isValidCatalogMeta` on create & update) | PASS |
| `/admins/{adminUid}` | Blocked (`hasOnly`) | Blocked (`email_verified == true`) | Restricted to self or bootstrapped admin | `allow list: if false` | Blocked (`grantedByUid == request.auth.uid` + `uid == adminUid`) | Blocked (`isValidAdminMember` + `isBootstrappedAdmin`) | PASS |
