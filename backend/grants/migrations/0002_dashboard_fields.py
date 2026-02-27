from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("grants", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="grant",
            name="title",
            field=models.CharField(default="Untitled Grant", max_length=180),
        ),
        migrations.AddField(
            model_name="grant",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="grant",
            name="category",
            field=models.CharField(blank=True, default="General", max_length=80),
        ),
        migrations.AddField(
            model_name="grant",
            name="application_deadline",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="grant",
            name="total_funding_lovelace",
            field=models.BigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="grant",
            name="max_per_beneficiary_lovelace",
            field=models.BigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="grant",
            name="distributed_lovelace",
            field=models.BigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="grant",
            name="milestones",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="application",
            name="organization",
            field=models.CharField(blank=True, max_length=180),
        ),
        migrations.AddField(
            model_name="application",
            name="requested_amount_lovelace",
            field=models.BigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="application",
            name="released_amount_lovelace",
            field=models.BigIntegerField(default=0),
        ),
    ]
