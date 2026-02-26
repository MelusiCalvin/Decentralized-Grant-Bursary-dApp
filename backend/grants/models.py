import uuid
from django.db import models
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Grant(TimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FUNDED = "funded", "Funded"
        APPROVED = "approved", "Approved"
        CLAIMED = "claimed", "Claimed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    admin_wallet = models.CharField(max_length=200)
    beneficiary_wallet = models.CharField(max_length=200, blank=True)
    amount_lovelace = models.BigIntegerField(default=0)
    unlock_time = models.DateTimeField(null=True, blank=True)
    milestone_approved = models.BooleanField(default=True)

    approved = models.BooleanField(default=False)
    paid = models.BooleanField(default=False)

    funded_tx_hash = models.CharField(max_length=128, blank=True)
    approved_tx_hash = models.CharField(max_length=128, blank=True)
    claim_tx_hash = models.CharField(max_length=128, blank=True)

    notes = models.TextField(blank=True)

    def is_unlocked(self):
        if not self.unlock_time:
            return False
        return timezone.now() >= self.unlock_time

    def is_claimable_for(self, wallet_address):
        return all(
            [
                self.approved,
                self.milestone_approved,
                self.is_unlocked(),
                not self.paid,
                self.amount_lovelace > 0,
                bool(wallet_address),
                wallet_address == self.beneficiary_wallet,
            ]
        )

    def __str__(self):
        return f"Grant {self.id} ({self.status})"


class Application(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grant = models.ForeignKey(
        Grant,
        related_name="applications",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    wallet_address = models.CharField(max_length=200)
    full_name = models.CharField(max_length=160)
    email = models.EmailField()
    purpose = models.TextField()
    proof_url = models.URLField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    def __str__(self):
        return f"{self.full_name} ({self.status})"


class AuditEvent(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grant = models.ForeignKey(
        Grant,
        related_name="audit_events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    actor_wallet = models.CharField(max_length=200, blank=True)
    action = models.CharField(max_length=60)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} @ {self.created_at.isoformat()}"
