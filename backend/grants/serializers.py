from django.utils import timezone
from rest_framework import serializers
from .models import Application, AuditEvent, Grant


class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = [
            "id",
            "grant",
            "wallet_address",
            "full_name",
            "email",
            "purpose",
            "proof_url",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "status"]


class ApplicationReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Application.Status.values)
    grant_id = serializers.UUIDField(required=False)


class GrantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grant
        fields = [
            "id",
            "status",
            "admin_wallet",
            "beneficiary_wallet",
            "amount_lovelace",
            "unlock_time",
            "milestone_approved",
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

    def validate_unlock_time(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Unlock time must be in the future.")
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
