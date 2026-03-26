from django.urls import path
from .views import (
    ApplicantReportExportView,
    ApplicationListCreateView,
    ApplicationReviewView,
    ApplicationWithdrawView,
    AuditEventListView,
    ConnectionLogCreateView,
    GrantReportExportView,
    GrantApproveView,
    GrantClaimabilityView,
    GrantDeleteView,
    GrantListCreateView,
    GrantRecordClaimView,
    GrantRecordFundingView,
    HealthView,
    home,
)


urlpatterns = [
    path("", home, name="home"),
    path("health/", HealthView.as_view(), name="health"),
    path("connections/", ConnectionLogCreateView.as_view(), name="connection-log-create"),
    path("applications/", ApplicationListCreateView.as_view(), name="application-list-create"),
    path(
        "applications/<uuid:application_id>/review/",
        ApplicationReviewView.as_view(),
        name="application-review",
    ),
    path(
        "applications/<uuid:application_id>/withdraw/",
        ApplicationWithdrawView.as_view(),
        name="application-withdraw",
    ),
    path("grants/", GrantListCreateView.as_view(), name="grant-list-create"),
    path("grants/<uuid:grant_id>/delete/", GrantDeleteView.as_view(), name="grant-delete"),
    path("grants/<uuid:grant_id>/approve/", GrantApproveView.as_view(), name="grant-approve"),
    path(
        "grants/<uuid:grant_id>/record-funding/",
        GrantRecordFundingView.as_view(),
        name="grant-record-funding",
    ),
    path(
        "grants/<uuid:grant_id>/claimable/",
        GrantClaimabilityView.as_view(),
        name="grant-claimability",
    ),
    path(
        "grants/<uuid:grant_id>/record-claim/",
        GrantRecordClaimView.as_view(),
        name="grant-record-claim",
    ),
    path("audit-events/", AuditEventListView.as_view(), name="audit-events"),
    path("reports/grants/", GrantReportExportView.as_view(), name="grant-report-export"),
    path("reports/applicants/", ApplicantReportExportView.as_view(), name="applicant-report-export"),
]
