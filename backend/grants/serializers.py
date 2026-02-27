from django.utils import timezone
from rest_framework import serializers
from .models import Application, AuditEvent, Grant


class ApplicationSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        wallet_address = attrs.get("wallet_address") or getattr(self.instance, "wallet_address", "")
        grant = attrs.get("grant") or getattr(self.instance, "grant", None)

        if not self.instance and not attrs.get("grant"):
            raise serializers.ValidationError({"grant": "Grant selection is required."})

        if wallet_address and Grant.objects.filter(admin_wallet=wallet_address).exists():
            raise serializers.ValidationError(
                {"wallet_address": "Wallets that create/fund grants cannot submit applications."}
            )

        if grant and wallet_address and grant.admin_wallet == wallet_address:
            raise serializers.ValidationError({"wallet_address": "Grant creator wallet cannot apply to this grant."})

        if grant and grant.application_deadline and timezone.now() > grant.application_deadline:
            raise serializers.ValidationError({"grant": "Application deadline has passed for this grant."})

        requested_amount = attrs.get("requested_amount_lovelace")
        if requested_amount is not None and requested_amount < 0:
            raise serializers.ValidationError({"requested_amount_lovelace": "Requested amount cannot be negative."})

        if (
            grant
            and requested_amount is not None
            and grant.max_per_beneficiary_lovelace > 0
            and requested_amount > grant.max_per_beneficiary_lovelace
        ):
            raise serializers.ValidationError(
                {"requested_amount_lovelace": "Requested amount exceeds grant max per beneficiary."}
            )

        return attrs

    class Meta:
        model = Application
        fields = [
            "id",
            "grant",
            "wallet_address",
            "full_name",
            "email",
            "organization",
            "purpose",
            "proof_url",
            "requested_amount_lovelace",
            "released_amount_lovelace",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "status", "released_amount_lovelace"]


class ApplicationReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Application.Status.values)
    grant_id = serializers.UUIDField(required=False)


class GrantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grant
        fields = [
            "id",
            "status",
            "title",
            "description",
            "category",
            "admin_wallet",
            "beneficiary_wallet",
            "application_deadline",
            "total_funding_lovelace",
            "max_per_beneficiary_lovelace",
            "distributed_lovelace",
            "amount_lovelace",
            "unlock_time",
            "milestone_approved",
            "milestones",
            "approved",
            "paid",
            "funded_tx_hash",
            "approved_tx_hash",
            "claim_tx_hash",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "approved",
            "paid",
            "funded_tx_hash",
            "approved_tx_hash",
            "claim_tx_hash",
            "created_at",
            "updated_at",
        ]

    def validate_amount_lovelace(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_total_funding_lovelace(self, value):
        if value < 0:
            raise serializers.ValidationError("Total funding pool cannot be negative.")
        return value

    def validate_max_per_beneficiary_lovelace(self, value):
        if value < 0:
            raise serializers.ValidationError("Max per beneficiary cannot be negative.")
        return value

    def validate_unlock_time(self, value):
        # Draft grant creation can store any candidate unlock time.
        # Strict "must be future" enforcement happens in GrantApproveView.
        return value


class GrantApproveSerializer(serializers.Serializer):
    admin_wallet = serializers.CharField(max_length=200)
    beneficiary_wallet = serializers.CharField(max_length=200)
    amount_lovelace = serializers.IntegerField(min_value=1)
    unlock_time = serializers.DateTimeField()
    milestone_approved = serializers.BooleanField(default=True)
    approval_tx_hash = serializers.CharField(max_length=128, required=False, allow_blank=True)


class FundingRecordSerializer(serializers.Serializer):
    admin_wallet = serializers.CharField(max_length=200)
    funded_tx_hash = serializers.CharField(max_length=128)


class ClaimRecordSerializer(serializers.Serializer):
    wallet_address = serializers.CharField(max_length=200)
    claim_tx_hash = serializers.CharField(max_length=128)


class AuditEventSerializer(serializers.ModelSerializer):
    grant_id = serializers.UUIDField(source="grant.id", allow_null=True, read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "grant_id",
            "actor_wallet",
            "action",
            "details",
            "created_at",
        ]
