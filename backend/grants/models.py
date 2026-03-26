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
    title = models.CharField(max_length=180, default="Untitled Grant")
    description = models.TextField(blank=True)
    category = models.CharField(max_length=80, default="General", blank=True)

    admin_wallet = models.CharField(max_length=200)
    beneficiary_wallet = models.CharField(max_length=200, blank=True)
    application_deadline = models.DateTimeField(null=True, blank=True)
    total_funding_lovelace = models.BigIntegerField(default=0)
    max_per_beneficiary_lovelace = models.BigIntegerField(default=0)
    distributed_lovelace = models.BigIntegerField(default=0)
    amount_lovelace = models.BigIntegerField(default=0)
    unlock_time = models.DateTimeField(null=True, blank=True)
    milestone_approved = models.BooleanField(default=True)
    milestones = models.JSONField(default=list, blank=True)

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
        WITHDRAWN = "withdrawn", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    grant = models.ForeignKey(
        Grant,
        related_name="applications",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )

    wallet_address = models.CharField(max_length=200)
    full_name = models.CharField(max_length=160)
    email = models.EmailField()
    organization = models.CharField(max_length=180, blank=True)
    purpose = models.TextField()
    proof_url = models.URLField(blank=True)
    milestone_submissions = models.JSONField(default=list, blank=True)
    requested_amount_lovelace = models.BigIntegerField(default=0)
    released_amount_lovelace = models.BigIntegerField(default=0)
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


class ConnectionLog(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet_address = models.CharField(max_length=200)
    device = models.CharField(max_length=220, blank=True)
    user_agent = models.TextField(blank=True)
    platform = models.CharField(max_length=120, blank=True)
    locale = models.CharField(max_length=32, blank=True)
    client_timezone = models.CharField(max_length=80, blank=True)
    connected_at_client = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    location = models.CharField(max_length=220, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def location_display(self):
        if self.location:
            return self.location
        if self.latitude is not None and self.longitude is not None:
            return f"{self.latitude}, {self.longitude}"
        return ""

    def __str__(self):
        return f"{self.wallet_address} @ {self.created_at.isoformat()}"
