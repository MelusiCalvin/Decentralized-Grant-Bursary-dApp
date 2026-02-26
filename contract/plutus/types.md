# Grant Datum / Redeemer Specification

## Datum

```haskell
data GrantDatum = GrantDatum
  { adminPkh          :: PubKeyHash
  , beneficiaryPkh    :: PubKeyHash
  , amount            :: Integer
  , unlockTime        :: POSIXTime
  , milestoneApproved :: Bool
  , paid              :: Bool
  }
```

## Redeemer

```haskell
data GrantRedeemer
  = Claim
  | AdminUpdateMilestone Bool
```

## Rule Summary

`Claim` must satisfy:

- tx signed by `beneficiaryPkh`
- validity range starts at or after `unlockTime`
- `milestoneApproved` is true
- `paid` is false
- script output is consumed exactly once for designated payout flow

`AdminUpdateMilestone` (future extension):

- tx signed by `adminPkh`
- updates milestone flag without violating payout safety
