from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("grants", "0002_dashboard_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="milestone_submissions",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

