from django.conf import settings
from django.contrib import admin
from django.conf.urls.static import static
from django.urls import include, path
from grants.urls import home
from grants.views import ApplicantReportExportView, GrantReportExportView


urlpatterns = [
    path('', home, name='home'),   # homepage
    path("admin/", admin.site.urls),
    path("api/", include("grants.urls")),
    # Compatibility aliases for clients that call report routes without "/api".
    path("reports/grants/", GrantReportExportView.as_view(), name="grant-report-export-compat"),
    path("reports/applicants/", ApplicantReportExportView.as_view(), name="applicant-report-export-compat"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
