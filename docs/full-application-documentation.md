# GrantFlow Application Documentation

## 1. Overview

GrantFlow is a Django + JavaScript decentralized grant/bursary management app with Cardano Lace wallet integration.

It supports:
- Funder grant creation and management
- Applicant submissions with milestone evidence
- Funder review (approve/reject), funding, and audit tracking
- Applicant claim flow
- Grant deletion by owning funder only, with cascading deletion of related applications

## 2. Technology Stack

- Backend: Django 5.1 + Django REST Framework
- Frontend: Server-rendered HTML template + vanilla JS modules
- Database: SQLite (`backend/db.sqlite3`)
- Wallet: Lace (CIP-30 browser wallet API)
- Static serving: WhiteNoise

## 3. Repository Structure

- `backend/`
- `backend/bursary/`: Django project settings and URL configuration
- `backend/grants/`: Domain models, API serializers, views, and routes
- `static/js/`: Frontend application logic and API client
- `templates/`: Main `index.html` UI
- `docs/`: Architecture and technical documentation

## 4. Domain Model

### 4.1 Grant

Stored in `grants_grant`:
- identity: `id` (UUID), `status`
- metadata: `title`, `description`, `category`, `notes`, `milestones`
- ownership: `admin_wallet` (grant creator/funder)
- funding fields: `total_funding_lovelace`, `max_per_beneficiary_lovelace`, `amount_lovelace`, `distributed_lovelace`
- beneficiary + payout: `beneficiary_wallet`, `unlock_time`, `approved`, `paid`
- transaction references: `funded_tx_hash`, `approved_tx_hash`, `claim_tx_hash`

### 4.2 Application

Stored in `grants_application`:
- identity: `id`, `status`
- linkage: `grant` (FK to `Grant`, `on_delete=CASCADE`)
- applicant fields: `wallet_address`, `full_name`, `email`, `organization`
- request/evidence: `purpose`, `proof_url`, `milestone_submissions`
- amounts: `requested_amount_lovelace`, `released_amount_lovelace`

### 4.3 AuditEvent

Stored in `grants_auditevent`:
- `action`, `actor_wallet`, `details`, `grant` (nullable FK), timestamps

## 5. Permissions and Authorization Rules

### 5.1 Wallet-Ownership Rule

Management actions require the grant owner wallet (`admin_wallet`) to match `grant.admin_wallet`.

This is enforced backend-side in:
- grant approval
- funding record
- application review
- grant deletion

### 5.2 New/Unrelated Wallets

Wallets that did not create a given grant cannot manage that grant or its linked applications.

The UI also blocks those actions, but backend checks are authoritative.

### 5.3 Grant Deletion Rule

Only the funder that created the grant can delete it.

Deleting a grant also deletes all related applications (`Application.grant` uses `CASCADE`).

## 6. API Endpoints

Base path: `/api`

### 6.1 Health

- `GET /health/`
- Returns service + DB health

### 6.2 Applications

- `GET /applications/?applicant_wallet=<addr>`
- `GET /applications/?funder_wallet=<addr>`
- `POST /applications/`
- `POST /applications/<application_id>/review/`

Review payload:
```json
{
  "status": "approved|rejected|pending",
  "admin_wallet": "addr...",
  "grant_id": "optional-uuid"
}
```

### 6.3 Grants

- `GET /grants/`
- `POST /grants/`
- `DELETE /grants/<grant_id>/delete/`
- `POST /grants/<grant_id>/approve/`
- `POST /grants/<grant_id>/record-funding/`
- `GET /grants/<grant_id>/claimable/?wallet=<addr>`
- `POST /grants/<grant_id>/record-claim/`

Grant delete payload:
```json
{
  "admin_wallet": "addr..."
}
```

Delete response:
```json
{
  "ok": true,
  "grant_id": "<uuid>",
  "deleted_applications_count": 3
}
```

### 6.4 Audit

- `GET /audit-events/`
- `GET /audit-events/?grant_id=<uuid>`

## 7. Frontend Behavior

Main logic is in `static/js/app.js`.

### 7.1 Roles

Computed from historical activity:
- `guest`
- `new`
- `applicant`
- `funder`

### 7.2 Grant Management Controls

For grant owner wallets only:
- view applicants
- manage grant
- delete grant

Non-owner wallets see read-only controls.

### 7.3 Wallet Confirmation

Review actions (approve/reject) trigger Lace signature confirmation before API requests.

## 8. Main Workflows

### 8.1 Create Grant

1. Funder connects Lace wallet
2. Funder enters grant + milestone details
3. Frontend submits grant payload
4. Backend stores grant + audit event

### 8.2 Apply to Grant

1. Applicant selects grant
2. Applicant submits profile, amount, and milestone evidence
3. Backend validates milestone requirements and saves application

### 8.3 Review Application

1. Funder signs review action in wallet
2. Funder approves/rejects
3. Backend enforces owner-wallet grant check and updates application status

### 8.4 Fund and Claim

1. Funder records funding transaction
2. Applicant claims when claimability checks pass
3. Backend records claim state and released amount

### 8.5 Delete Grant

1. Owner funder chooses delete
2. UI asks for confirmation
3. Backend verifies owner wallet
4. Grant is deleted, related applications are deleted automatically
5. Audit event is recorded with deleted application count

## 9. Configuration

### 9.1 Django Settings

Important current setup:
- SQLite database:
  - `ENGINE = django.db.backends.sqlite3`
  - `NAME = BASE_DIR / "db.sqlite3"`
- WhiteNoise static serving
- CORS enabled for all origins

### 9.2 Frontend Config

In `static/js/config.js`:
- API base URL
- network configuration
- wallet name
- Blockfrost placeholders

## 10. Local Development

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Then open the app page served by Django.

## 11. Deployment Notes

Current `Procfile`:

```text
web: python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn bursary.wsgi:application
```

This applies migrations and static collection before startup.

## 12. Troubleshooting

### 12.1 HTTP 500 on `/api/grants/` or `/api/applications/`

Check:
- migrations were applied successfully
- database file exists and is writable (`backend/db.sqlite3`)
- `GET /api/health/` returns `database: ok`

### 12.2 Static Asset MIME errors

Ensure:
- `STATIC_URL = "/static/"`
- static files are collected on deploy

### 12.3 Wallet Authorization failures

Ensure:
- Lace extension is installed and unlocked
- expected wallet address is connected

## 13. Security Considerations

- Backend trust currently relies on supplied wallet address values and client-driven signatures.
- There is no server-side cryptographic wallet signature verification yet.
- For stronger security, add backend signature verification and authenticated session/token flows.

