# GrantFlow ERD

## Entity Relationship Diagram

```mermaid
erDiagram
    GRANT ||--o{ APPLICATION : contains
    GRANT ||--o{ AUDIT_EVENT : referenced_by

    GRANT {
        uuid id PK
        string status
        string title
        text description
        string category
        string admin_wallet
        string beneficiary_wallet
        datetime application_deadline
        bigint total_funding_lovelace
        bigint max_per_beneficiary_lovelace
        bigint distributed_lovelace
        bigint amount_lovelace
        datetime unlock_time
        boolean milestone_approved
        json milestones
        boolean approved
        boolean paid
        string funded_tx_hash
        string approved_tx_hash
        string claim_tx_hash
        text notes
        datetime created_at
        datetime updated_at
    }

    APPLICATION {
        uuid id PK
        uuid grant_id FK
        string wallet_address
        string full_name
        string email
        string organization
        text purpose
        string proof_url
        json milestone_submissions
        bigint requested_amount_lovelace
        bigint released_amount_lovelace
        string status
        datetime created_at
        datetime updated_at
    }

    AUDIT_EVENT {
        uuid id PK
        uuid grant_id FK
        string actor_wallet
        string action
        json details
        datetime created_at
        datetime updated_at
    }
```

## Relationship Notes

- `GRANT -> APPLICATION` is one-to-many.
- `APPLICATION.grant_id` uses `on_delete=CASCADE`.
- Deleting a grant deletes all linked applications.
- `GRANT -> AUDIT_EVENT` is one-to-many.
- `AUDIT_EVENT.grant_id` is nullable, so some audit events may be global.
