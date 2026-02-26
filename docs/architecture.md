# MVP Architecture

## Components

1. **Smart Contract (Plutus V2 skeleton)**
- Locks ADA at script address
- Enforces beneficiary, unlock time, milestone approval, and single payout

2. **Frontend (Tailwind + JS + Lucid)**
- Beneficiary application form
- Admin grant create/approve/fund actions
- Beneficiary claim action
- Lace wallet (CIP-30) connect/sign

3. **Backend (Django REST API)**
- Stores applications and grant metadata
- Stores approval/funding/claim records
- Provides claimability checks
- Exposes audit feed

## Data Boundaries

- **On-chain**
  - beneficiary credential
  - amount
  - unlock timestamp
  - milestone flag
  - paid flag

- **Off-chain**
  - beneficiary personal data
  - documents/proof URLs
  - operational logs/reporting data

## API Endpoints

- `GET /api/health/`
- `GET|POST /api/applications/`
- `POST /api/applications/<application_id>/review/`
- `GET|POST /api/grants/`
- `POST /api/grants/<grant_id>/approve/`
- `POST /api/grants/<grant_id>/record-funding/`
- `GET /api/grants/<grant_id>/claimable/?wallet=...`
- `POST /api/grants/<grant_id>/record-claim/`
- `GET /api/audit-events/`

## Security Notes

- Admin cannot approve themselves as beneficiary.
- Claim endpoint validates wallet eligibility, unlock time, and payment status.
- Audit event is created for every state-changing action.
