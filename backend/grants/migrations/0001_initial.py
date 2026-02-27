# Generated manually for MVP baseline schema
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Grant",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("funded", "Funded"), ("approved", "Approved"), ("claimed", "Claimed")], default="draft", max_length=20)),
                ("title", models.CharField(default="Untitled Grant", max_length=180)),
                ("description", models.TextField(blank=True)),
                ("category", models.CharField(blank=True, default="General", max_length=80)),
                ("admin_wallet", models.CharField(max_length=200)),
                ("beneficiary_wallet", models.CharField(blank=True, max_length=200)),
                ("application_deadline", models.DateTimeField(blank=True, null=True)),
                ("total_funding_lovelace", models.BigIntegerField(default=0)),
                ("max_per_beneficiary_lovelace", models.BigIntegerField(default=0)),
                ("distributed_lovelace", models.BigIntegerField(default=0)),
                ("amount_lovelace", models.BigIntegerField(default=0)),
                ("unlock_time", models.DateTimeField(blank=True, null=True)),
                ("milestone_approved", models.BooleanField(default=True)),
                ("milestones", models.JSONField(blank=True, default=list)),
                ("approved", models.BooleanField(default=False)),
                ("paid", models.BooleanField(default=False)),
                ("funded_tx_hash", models.CharField(blank=True, max_length=128)),
                ("approved_tx_hash", models.CharField(blank=True, max_length=128)),
                ("claim_tx_hash", models.CharField(blank=True, max_length=128)),
                ("notes", models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name="Application",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("wallet_address", models.CharField(max_length=200)),
                ("full_name", models.CharField(max_length=160)),
                ("email", models.EmailField(max_length=254)),
                ("organization", models.CharField(blank=True, max_length=180)),
                ("purpose", models.TextField()),
                ("proof_url", models.URLField(blank=True)),
                ("requested_amount_lovelace", models.BigIntegerField(default=0)),
                ("released_amount_lovelace", models.BigIntegerField(default=0)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="pending", max_length=20)),
                (
                    "grant",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="applications", to="grants.grant"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("actor_wallet", models.CharField(blank=True, max_length=200)),
                ("action", models.CharField(max_length=60)),
                ("details", models.JSONField(blank=True, default=dict)),
                (
                    "grant",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_events", to="grants.grant"),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
