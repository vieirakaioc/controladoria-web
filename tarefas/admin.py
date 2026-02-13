from django.contrib import admin
from .models import Sector, Priority, Frequency, Classification, TaskTemplate, TaskRun, TaskIdCounter

admin.site.register(Sector)
admin.site.register(Priority)
admin.site.register(Frequency)
admin.site.register(Classification)
admin.site.register(TaskIdCounter)

@admin.register(TaskTemplate)
class TaskTemplateAdmin(admin.ModelAdmin):
    list_display = ("task_id", "atividade", "sector", "priority", "frequency", "dia_util", "active", "responsible")
    list_filter = ("sector", "priority", "frequency", "active", "dia_util")
    search_fields = ("task_id", "atividade", "planner")

@admin.register(TaskRun)
class TaskRunAdmin(admin.ModelAdmin):
    list_display = ("template", "due_date", "done_date", "get_status", "done_by")
    list_filter = ("due_date", "done_date")
    search_fields = ("template__task_id", "template__atividade")

    def get_status(self, obj):
        return obj.status
    get_status.short_description = "Status"
