# Decentralized Grant / Bursary Distribution System (MVP)

Cardano + Lace wallet grant distribution MVP with:

- **On-chain contract specification** (Plutus V2 oriented)
- **Off-chain backend** using **Python Django**
- **Web dApp** using **Tailwind CSS + CIP-30 wallet flow**
- **Lucid integration layer** for contract transactions

## MVP Features

- One admin wallet
- One beneficiary wallet
- Time-based unlock
- Single payout
- Off-chain application review + audit trail

## Project Structure

- `backend/`: Django API for applications, approvals, claim checks, and audit logs
- `js/`: Frontend logic (wallet manager, Lucid service, app controller)
- `contract/`: Plutus validator skeleton + datum/redeemer docs
- `index.html`: Tailwind UI dApp

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations grants
python manage.py migrate
python manage.py runserver
```

API runs at `http://127.0.0.1:8000`.

### 2. Frontend

Open `index.html` in a browser that has Lace installed.

Set values in `js/config.js`:

- `API_BASE_URL`
- `BLOCKFROST_API_KEY`
- `NETWORK`
- `GRANT_SCRIPT_ADDRESS`
- `GRANT_VALIDATOR_CBOR_HEX` (required for claim flow)

## Security Notes

- Personal details stay off-chain.
- On-chain logic enforces approved beneficiary, unlock time, and single payout.
- Backend stores audit events for reporting and donor transparency.

## Next Iteration

- Milestone-based payouts
- Multiple beneficiaries
- Admin authentication + signed backend actions
- Plutus compilation/deployment pipeline
