import base64
import binascii
import uuid
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from .models import Application, AuditEvent, Grant


class ApplicationSerializer(serializers.ModelSerializer):
    MAX_PDF_BYTES = 8 * 1024 * 1024

    def _milestone_input_type(self, milestone):
        explicit = str((milestone or {}).get("input_type", "")).strip().lower()
        if explicit in {"pdf", "link"}:
            return explicit
        text = f"{(milestone or {}).get('title', '')} {(milestone or {}).get('description', '')}".lower()
        return "link" if "link" in text or "url" in text else "pdf"

    def _milestone_optional(self, milestone):
        text = f"{(milestone or {}).get('title', '')} {(milestone or {}).get('description', '')}".lower()
        return "optional" in text or "bonus" in text

    def _decode_pdf_data(self, file_data):
        if not isinstance(file_data, str) or not file_data.strip():
            raise serializers.ValidationError("PDF file_data is required.")

        encoded = file_data.strip()
        if "," in encoded and encoded.lower().startswith("data:"):
            header, encoded = encoded.split(",", 1)
            header = header.lower()
            if "application/pdf" not in header or ";base64" not in header:
                raise serializers.ValidationError("Uploaded file must be a base64-encoded PDF.")

        try:
            content = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as error:
            raise serializers.ValidationError("Invalid base64 PDF payload.") from error

        if not content.startswith(b"%PDF-"):
            raise serializers.ValidationError("Uploaded file is not a valid PDF document.")
        if len(content) > self.MAX_PDF_BYTES:
            raise serializers.ValidationError("PDF file size cannot exceed 8MB.")
        return content

    def _save_milestone_pdf(self, original_name, pdf_bytes):
        upload_dir = Path(settings.MEDIA_ROOT) / "milestone_uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_stem = slugify(Path(str(original_name or "milestone")).stem)[:64] or "milestone"
        stored_name = f"{uuid.uuid4().hex}_{file_stem}.pdf"
        target = upload_dir / stored_name
        target.write_bytes(pdf_bytes)

        relative_url = f"{settings.MEDIA_URL.rstrip('/')}/milestone_uploads/{stored_name}"
        request = self.context.get("request")
        return request.build_absolute_uri(relative_url) if request else relative_url

    def _validate_and_normalize_milestone_submissions(self, grant, submissions):
        if submissions in (None, ""):
            submissions = []
        if not isinstance(submissions, list):
            raise serializers.ValidationError({"milestone_submissions": "Expected a list of milestone submissions."})

        grant_milestones = list(grant.milestones or [])
        if not grant_milestones:
            if submissions:
                raise serializers.ValidationError(
                    {"milestone_submissions": "This grant has no milestone requirements configured."}
                )
            return []

        index_to_submission = {}
        errors = {}
        link_validator = URLValidator()

        for raw in submissions:
            if not isinstance(raw, dict):
                errors["format"] = "Each milestone submission must be an object."
                continue

            try:
                index = int(raw.get("milestone_index"))
            except (TypeError, ValueError):
                errors["index"] = "Each submission must include a valid milestone_index."
                continue

            if index < 0 or index >= len(grant_milestones):
                errors[str(index)] = "milestone_index is out of range for this grant."
                continue
            if index in index_to_submission:
                errors[str(index)] = "Duplicate submission for milestone."
                continue

            expected = grant_milestones[index]
            expected_type = self._milestone_input_type(expected)
            submitted_type = str(raw.get("type") or expected_type).strip().lower()
            if submitted_type not in {"pdf", "link"}:
                errors[str(index)] = "Submission type must be 'pdf' or 'link'."
                continue
            if submitted_type != expected_type:
                errors[str(index)] = f"This milestone expects a {expected_type} submission."
                continue

            normalized = {
                "milestone_index": index,
                "title": str(expected.get("title") or raw.get("title") or f"Milestone {index + 1}"),
                "type": submitted_type,
            }

            if submitted_type == "link":
                link_url = str(raw.get("link_url") or "").strip()
                if not link_url:
                    errors[str(index)] = "link_url is required for this milestone."
                    continue
                try:
                    link_validator(link_url)
                except DjangoValidationError as error:
                    errors[str(index)] = error.messages[0] if error.messages else "Invalid link URL."
                    continue
                normalized["link_url"] = link_url
            else:
                file_name = str(raw.get("file_name") or "").strip()
                file_data = raw.get("file_data")
                if not file_name:
                    errors[str(index)] = "file_name is required for PDF milestone submissions."
                    continue
                try:
                    self._decode_pdf_data(file_data)
                except serializers.ValidationError as error:
                    errors[str(index)] = error.detail if hasattr(error, "detail") else str(error)
                    continue
                normalized["file_name"] = file_name
                normalized["file_data"] = str(file_data)

            index_to_submission[index] = normalized

        for index, milestone in enumerate(grant_milestones):
            if self._milestone_optional(milestone):
                continue
            if index not in index_to_submission:
                errors[str(index)] = "Submission required for this milestone."

        if errors:
            raise serializers.ValidationError({"milestone_submissions": errors})

        return [index_to_submission[index] for index in sorted(index_to_submission)]

    def _persist_milestone_submissions(self, submissions):
        persisted = []
        for item in submissions:
            if item.get("type") == "link":
                persisted.append(
                    {
                        "milestone_index": item["milestone_index"],
                        "title": item["title"],
                        "type": "link",
                        "link_url": item["link_url"],
                    }
                )
                continue

            pdf_bytes = self._decode_pdf_data(item.get("file_data"))
            file_url = self._save_milestone_pdf(item.get("file_name"), pdf_bytes)
            persisted.append(
                {
                    "milestone_index": item["milestone_index"],
                    "title": item["title"],
                    "type": "pdf",
                    "file_name": item.get("file_name", "document.pdf"),
                    "file_url": file_url,
                }
            )
        return persisted

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

        milestone_submissions = attrs.get("milestone_submissions")
        if grant and (milestone_submissions is not None or not self.instance):
            attrs["milestone_submissions"] = self._validate_and_normalize_milestone_submissions(
                grant=grant,
                submissions=milestone_submissions if milestone_submissions is not None else [],
            )

        return attrs

    def create(self, validated_data):
        submissions = validated_data.get("milestone_submissions", [])
        validated_data["milestone_submissions"] = self._persist_milestone_submissions(submissions)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "milestone_submissions" in validated_data:
            validated_data["milestone_submissions"] = self._persist_milestone_submissions(
                validated_data["milestone_submissions"]
            )
        return super().update(instance, validated_data)

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
            "milestone_submissions",
            "requested_amount_lovelace",
            "released_amount_lovelace",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "status", "released_amount_lovelace"]


class ApplicationReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[Application.Status.APPROVED, Application.Status.REJECTED]
    )
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
    application_id = serializers.UUIDField()


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
