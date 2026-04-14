from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as media_serve
from grants.urls import home


urlpatterns = [
    path('', home, name='home'),   # homepage
    path("admin/", admin.site.urls),
    path("api/", include("grants.urls")),
    # Serve uploaded application evidence files (PDFs) in production too.
    re_path(r"^media/(?P<path>.*)$", media_serve, {"document_root": settings.MEDIA_ROOT}),
]
