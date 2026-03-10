from django.conf import settings
from django.db import connections
from django.db.models import F
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Application, AuditEvent, Grant
from .serializers import (
    ApplicationReviewSerializer,
    ApplicationSerializer,
    AuditEventSerializer,
    ClaimRecordSerializer,
    FundingRecordSerializer,
    GrantApproveSerializer,
    GrantSerializer,
)


def home(request):
    return render(request, "index.html")

def log_event(action, actor_wallet="", grant=None, details=None):
    AuditEvent.objects.create(
        action=action,
        actor_wallet=actor_wallet or "",
        grant=grant,
        details=details or {},
    )


class HealthView(APIView):
    def get(self, request):
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            return Response({"ok": True, "service": "bursary-api", "database": "ok"})
        except Exception as exc:
            payload = {"ok": False, "service": "bursary-api", "database": "error"}
            if settings.DEBUG:
                payload["error"] = str(exc)
            return Response(payload, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ApplicationListCreateView(generics.ListCreateAPIView):
    serializer_class = ApplicationSerializer

    def get_queryset(self):
        queryset = Application.objects.select_related("grant").all().order_by("-created_at")
        applicant_wallet = self.request.query_params.get("applicant_wallet", "").strip()
        funder_wallet = self.request.query_params.get("funder_wallet", "").strip()

        if applicant_wallet:
            queryset = queryset.filter(wallet_address=applicant_wallet)
        elif funder_wallet:
            queryset = queryset.filter(grant__admin_wallet=funder_wallet)
        return queryset

    def perform_create(self, serializer):
        application = serializer.save()
        log_event(
            action="APPLICATION_SUBMITTED",
            actor_wallet=application.wallet_address,
            grant=application.grant,
            details={"application_id": str(application.id)},
        )


class ApplicationReviewView(APIView):
    def post(self, request, application_id):
        application = get_object_or_404(Application, id=application_id)
        serializer = ApplicationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        status_value = serializer.validated_data["status"]
        grant_id = serializer.validated_data.get("grant_id")
        admin_wallet = request.data.get("admin_wallet", "").strip()

        if not admin_wallet:
            return Response(
                {"error": "admin_wallet is required for application review."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_grant = application.grant

        if grant_id:
            target_grant = get_object_or_404(Grant, id=grant_id)
            application.grant = target_grant

        if not target_grant:
            return Response(
                {"error": "Application must be linked to a grant before review."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_grant.admin_wallet != admin_wallet:
            return Response(
                {"error": "Only the funder who created this grant can review its applicants."},
                status=status.HTTP_403_FORBIDDEN,
            )

        application.status = status_value
        application.save(update_fields=["status", "grant", "updated_at"])

        log_event(
            action="APPLICATION_REVIEWED",
            actor_wallet=admin_wallet,
            grant=application.grant,
            details={"application_id": str(application.id), "status": status_value},
        )
        return Response(ApplicationSerializer(application).data)


class GrantListCreateView(generics.ListCreateAPIView):
    queryset = Grant.objects.all().order_by("-created_at")
    serializer_class = GrantSerializer

    def perform_create(self, serializer):
        grant = serializer.save(status=Grant.Status.DRAFT)
        log_event(
            action="GRANT_CREATED",
            actor_wallet=grant.admin_wallet,
            grant=grant,
            details={"grant_id": str(grant.id)},
        )


class GrantDeleteView(APIView):
    def delete(self, request, grant_id):
        grant = get_object_or_404(Grant, id=grant_id)
        admin_wallet = (
            request.data.get("admin_wallet", "")
            or request.query_params.get("admin_wallet", "")
        ).strip()

        if not admin_wallet:
            return Response(
                {"error": "admin_wallet is required to delete a grant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if grant.admin_wallet != admin_wallet:
            return Response(
                {"error": "Only the funder who created this grant can delete it."},
                status=status.HTTP_403_FORBIDDEN,
            )

        related_applications_count = Application.objects.filter(grant=grant).count()
        deleted_grant_id = str(grant.id)
        deleted_grant_title = grant.title
        grant.delete()

        log_event(
            action="GRANT_DELETED",
            actor_wallet=admin_wallet,
            details={
                "grant_id": deleted_grant_id,
                "grant_title": deleted_grant_title,
                "deleted_applications_count": related_applications_count,
            },
        )

        return Response(
            {
                "ok": True,
                "grant_id": deleted_grant_id,
                "deleted_applications_count": related_applications_count,
            }
        )


class GrantApproveView(APIView):
    def post(self, request, grant_id):
        grant = get_object_or_404(Grant, id=grant_id)
        serializer = GrantApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["admin_wallet"] != grant.admin_wallet:
            return Response(
                {"error": "Only the owning admin wallet can approve this grant."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if data["beneficiary_wallet"] == data["admin_wallet"]:
            return Response(
                {"error": "Admin cannot approve a grant to the same wallet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if grant.paid:
            return Response(
                {"error": "Grant has already been paid and cannot be modified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if data["unlock_time"] <= timezone.now():
            return Response(
                {"error": "Unlock time must be in the future."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant.beneficiary_wallet = data["beneficiary_wallet"]
        grant.amount_lovelace = data["amount_lovelace"]
        if grant.max_per_beneficiary_lovelace <= 0:
            grant.max_per_beneficiary_lovelace = data["amount_lovelace"]
        grant.unlock_time = data["unlock_time"]
        grant.milestone_approved = data["milestone_approved"]
        grant.approved = True
        grant.approved_tx_hash = data.get("approval_tx_hash", "")
        grant.status = Grant.Status.APPROVED
        grant.save()

        log_event(
            action="GRANT_APPROVED",
            actor_wallet=data["admin_wallet"],
            grant=grant,
            details={
                "beneficiary_wallet": grant.beneficiary_wallet,
                "amount_lovelace": grant.amount_lovelace,
                "unlock_time": grant.unlock_time.isoformat(),
            },
        )
        return Response(GrantSerializer(grant).data)


class GrantRecordFundingView(APIView):
    def post(self, request, grant_id):
        grant = get_object_or_404(Grant, id=grant_id)
        serializer = FundingRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["admin_wallet"] != grant.admin_wallet:
            return Response(
                {"error": "Only the owning admin wallet can record funding."},
                status=status.HTTP_403_FORBIDDEN,
            )

        grant.funded_tx_hash = data["funded_tx_hash"]
        if grant.total_funding_lovelace <= 0:
            grant.total_funding_lovelace = max(grant.amount_lovelace, 0)
        if grant.status == Grant.Status.DRAFT:
            grant.status = Grant.Status.FUNDED
        grant.save(update_fields=["funded_tx_hash", "total_funding_lovelace", "status", "updated_at"])

        log_event(
            action="GRANT_FUNDED",
            actor_wallet=data["admin_wallet"],
            grant=grant,
            details={"funded_tx_hash": data["funded_tx_hash"]},
        )
        return Response(GrantSerializer(grant).data)


class GrantClaimabilityView(APIView):
    def get(self, request, grant_id):
        grant = get_object_or_404(Grant, id=grant_id)
        wallet = request.query_params.get("wallet", "").strip()
        now = timezone.now()

        checks = {
            "wallet_match": wallet == grant.beneficiary_wallet and bool(wallet),
            "time_unlocked": bool(grant.unlock_time and now >= grant.unlock_time),
            "approved": grant.approved,
            "milestone_approved": grant.milestone_approved,
            "not_paid": not grant.paid,
            "amount_positive": grant.amount_lovelace > 0,
        }
        claimable = all(checks.values())

        return Response(
            {
                "grant_id": str(grant.id),
                "claimable": claimable,
                "checks": checks,
                "unlock_time": grant.unlock_time.isoformat() if grant.unlock_time else None,
                "server_time_utc": now.isoformat(),
            }
        )


class GrantRecordClaimView(APIView):
    def post(self, request, grant_id):
        grant = get_object_or_404(Grant, id=grant_id)
        serializer = ClaimRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if not grant.is_claimable_for(data["wallet_address"]):
            return Response(
                {"error": "Claim conditions not satisfied for this wallet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant.claim_tx_hash = data["claim_tx_hash"]
        grant.paid = True
        grant.status = Grant.Status.CLAIMED
        grant.distributed_lovelace = (grant.distributed_lovelace or 0) + (grant.amount_lovelace or 0)
        grant.save(update_fields=["claim_tx_hash", "paid", "status", "distributed_lovelace", "updated_at"])

        Application.objects.filter(
            grant=grant,
            wallet_address=data["wallet_address"],
        ).update(released_amount_lovelace=F("released_amount_lovelace") + grant.amount_lovelace)

        log_event(
            action="GRANT_CLAIMED",
            actor_wallet=data["wallet_address"],
            grant=grant,
            details={"claim_tx_hash": data["claim_tx_hash"]},
        )
        return Response(GrantSerializer(grant).data)


class AuditEventListView(generics.ListAPIView):
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        queryset = AuditEvent.objects.all()
        grant_id = self.request.query_params.get("grant_id")
        if grant_id:
            queryset = queryset.filter(grant_id=grant_id)
        return queryset
