# Contract Layer (Plutus V2 Oriented)

This folder defines the on-chain contract model for the bursary system.

## Datum Shape

`GrantDatum` stores:

- `adminPkh`: payment key hash of admin
- `beneficiaryPkh`: approved beneficiary payment key hash
- `amount`: lovelace payout amount
- `unlockTime`: POSIX timestamp (ms)
- `milestoneApproved`: bool
- `paid`: bool

## Redeemer Actions

- `Claim`: beneficiary claims payout after conditions pass
- `AdminUpdateMilestone`: admin toggles milestone approval (future extension)

## Validator Conditions

Payout is valid only if:

1. signer is beneficiary
2. `currentTime >= unlockTime`
3. `milestoneApproved == true`
4. `paid == false`
5. paid amount equals datum amount

This is the on-chain authority for release.

## Files

- `plutus/grantValidator.hs`: validator skeleton (Plutus V2 style)
- `plutus/types.md`: datum/redeemer definitions
