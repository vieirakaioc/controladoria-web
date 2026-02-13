from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

class Sector(models.Model):
    name = models.CharField(max_length=120, unique=True)
    def __str__(self): return self.name

class Priority(models.Model):
    code = models.PositiveSmallIntegerField(unique=True)  # 0..3
    description = models.CharField(max_length=60)
    def __str__(self): return f"{self.code} - {self.description}"

class Frequency(models.Model):
    name = models.CharField(max_length=40, unique=True)  # Diária, Mensal etc.
    def __str__(self): return self.name

class Classification(models.Model):
    name = models.CharField(max_length=60, unique=True)
    def __str__(self): return self.name

class TaskIdCounter(models.Model):
    prefix = models.CharField(max_length=30, unique=True)
    last_number = models.PositiveIntegerField(default=0)
    def __str__(self): return f"{self.prefix} -> {self.last_number}"

class TaskTemplate(models.Model):
    # Cadastro da tarefa (modelo)
    task_id = models.CharField(max_length=40, unique=True, blank=True)
    planner = models.CharField(max_length=120, default="Check List")
    sector = models.ForeignKey(Sector, on_delete=models.PROTECT)
    tipo = models.CharField(max_length=60, blank=True)
    atividade = models.CharField(max_length=255)
    notas = models.TextField(blank=True)

    priority = models.ForeignKey(Priority, on_delete=models.PROTECT)
    frequency = models.ForeignKey(Frequency, on_delete=models.PROTECT)
    classification = models.ForeignKey(Classification, on_delete=models.PROTECT, null=True, blank=True)

    dia_util = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    responsible = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.task_id or 'NO-ID'} - {self.atividade}"

    @staticmethod
    def _abbr(text: str, max_len=3):
        t = (text or "").strip().upper()
        t = "".join(ch for ch in t if ch.isalnum() or ch.isspace())
        parts = [p for p in t.split() if p]
        if not parts:
            return "XXX"
        if len(parts) == 1:
            return (parts[0][:max_len] or "XXX")
        return ("".join(p[0] for p in parts[:max_len]) or "XXX")

    @transaction.atomic
    def _generate_task_id(self):
        planner_abbr = self._abbr(self.planner, 2)       # ex: Check List -> CL
        sector_abbr = self._abbr(self.sector.name, 3)    # ex: Contas a Pagar -> CAP
        prefix = f"{planner_abbr}-{sector_abbr}"

        counter, _ = TaskIdCounter.objects.select_for_update().get_or_create(prefix=prefix)
        counter.last_number += 1
        counter.save(update_fields=["last_number"])
        return f"{prefix}-{counter.last_number:06d}"

    def save(self, *args, **kwargs):
        if not self.task_id:
            self.task_id = self._generate_task_id()
        super().save(*args, **kwargs)

class TaskRun(models.Model):
    # Execução real (vencimento / conclusão)
    template = models.ForeignKey(TaskTemplate, on_delete=models.CASCADE, related_name="runs")
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    done_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)
    done_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="done_tasks")

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def status(self):
        today = timezone.localdate()
        if not self.due_date:
            return "Inserir programação (Datas)"
        if self.done_date:
            return "Entregue atrasado" if self.done_date > self.due_date else "Finalizado"
        if today > self.due_date:
            return "Atrasado"
        if today == self.due_date:
            return "Em dia"
        return "Em andamento"

    def __str__(self):
        return f"{self.template.task_id} | due={self.due_date} | done={self.done_date}"
