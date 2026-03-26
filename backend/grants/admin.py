from django.contrib import admin
from .models import Application, AuditEvent, ConnectionLog, Grant


@admin.register(Grant)
class GrantAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "category", "status", "admin_wallet", "beneficiary_wallet", "amount_lovelace", "paid")
    search_fields = ("title", "category", "admin_wallet", "beneficiary_wallet", "id")
    list_filter = ("status", "paid", "approved")


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ("id", "full_name", "organization", "wallet_address", "status", "created_at")
    search_fields = ("full_name", "wallet_address", "email", "organization")
    list_filter = ("status",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("id", "action", "actor_wallet", "grant", "created_at")
    search_fields = ("action", "actor_wallet")


@admin.register(ConnectionLog)
class ConnectionLogAdmin(admin.ModelAdmin):
    list_display = ("id", "wallet_address", "device", "ip_address", "location", "created_at")
    search_fields = ("wallet_address", "device", "ip_address", "location")
