{-# LANGUAGE DataKinds #-}
{-# LANGUAGE NoImplicitPrelude #-}
{-# LANGUAGE TemplateHaskell #-}

module GrantValidator where

import Plutus.V2.Ledger.Api (BuiltinData, POSIXTime, PubKeyHash, ScriptContext, Validator, mkValidatorScript)
import Plutus.V2.Ledger.Contexts (scriptContextTxInfo, txSignedBy, txInfoValidRange)
import Plutus.V1.Ledger.Interval (contains, from)
import qualified PlutusTx
import PlutusTx.Prelude hiding (Semigroup(..), unless)
import qualified Prelude as Haskell

-- Plutus V2 datum for the grant state.
data GrantDatum = GrantDatum
  { adminPkh :: PubKeyHash
  , beneficiaryPkh :: PubKeyHash
  , amount :: Integer
  , unlockTime :: POSIXTime
  , milestoneApproved :: Bool
  , paid :: Bool
  }

data GrantRedeemer
  = Claim
  | AdminUpdateMilestone Bool

PlutusTx.unstableMakeIsData ''GrantDatum
PlutusTx.unstableMakeIsData ''GrantRedeemer

{-# INLINABLE mkValidator #-}
mkValidator :: GrantDatum -> GrantRedeemer -> ScriptContext -> Bool
mkValidator datum redeemer ctx =
  case redeemer of
    Claim ->
      traceIfFalse "beneficiary signature missing" signedByBeneficiary &&
      traceIfFalse "unlock time not reached" unlockReached &&
      traceIfFalse "milestone not approved" (milestoneApproved datum) &&
      traceIfFalse "already paid" (not $ paid datum)
    AdminUpdateMilestone _newState ->
      traceIfFalse "admin signature missing" signedByAdmin
  where
    info = scriptContextTxInfo ctx
    signedByBeneficiary = txSignedBy info (beneficiaryPkh datum)
    signedByAdmin = txSignedBy info (adminPkh datum)

    -- NOTE: In production, validate with contains/from range checks against tx validity interval.
    unlockReached = contains (from (unlockTime datum)) (txInfoValidRange info)

{-# INLINABLE wrap #-}
wrap :: BuiltinData -> BuiltinData -> BuiltinData -> ()
wrap d r c =
  check (mkValidator (unsafeFromBuiltinData d) (unsafeFromBuiltinData r) (unsafeFromBuiltinData c))

validator :: Validator
validator = mkValidatorScript $$(PlutusTx.compile [|| wrap ||])

compiledCodeHint :: Haskell.String
compiledCodeHint = "Compile with your Plutus toolchain and export validator CBOR for frontend config."
