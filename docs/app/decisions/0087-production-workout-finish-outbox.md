# 0087. Production finish журнала через существующий outbox

- **Статус:** Реализовано; runtime и приёмка владельца открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-32, пакет только finish

## Контекст

Typed `finish_workout` и серверный SQL уже существуют. Production entry не должен
заменяться demo. `OutboxStore.save` атомарно сохраняет projection и команду;
API не выдаёт применённые receipts, а отсутствие pending не доказывает finish.

## Решение

Команда finish проходит через последовательную очередь entry service после
сохранений подходов. Projection хранит исходный operation envelope: повторные
нажатия, retry и reopen используют тот же ID, payload и base revision. Store,
runner, transport и SQL не меняются. Ошибка хранения не является успехом.

Сводка вычисляется из сохранённых подходов выбранного workout; draft и previous
suggestions не считаются результатами. Частичный и пустой журнал требуют явного
подтверждения с текстами prototype default `finishConfirm`.

Локально сохранённое завершение отличается от серверного. Подтверждённый server
snapshot определяет finished status и актуальную revision. Conflict, error и
correction receipt остаются видимыми отдельными исходами; correction не применяется
автоматически. Выбор текущей версии finish-конфликта сохраняет durable metadata:
после подтверждённого resolution открытый журнал показывает `not_finished`,
а не ожидание уже обработанной команды. Actor/workspace/login/workout/lifecycle
проверяются на async seams. Поздний snapshot с меньшей revision не перекрывает
свежий finished snapshot или его cache projection.

## Границы и следующие контракты

Finish не меняет attendance, debit, booking status или личную программу. Отдельно
нужны серверный контракт явного применения correction draft с revision и
идемпотентностью, а также selective program update с подтверждённой provenance,
выбором изменений и immutable version policy. `booking_programs.id` нельзя
использовать как `client_programs.id`. До появления контрактов UI не сообщает
фиктивный applied fix или update. SOM-32 целиком остаётся открытой.

## Проверка

Domain/service/hook/screen проверяются независимыми synthetic regressions.
Точные команды и результаты: [отчёт](../../../app/review/som-32-production-finish/README.md).
SQL/pgTAP/RLS/live auth, реальные SQLite/crash/reopen, native/браузер, два устройства,
визуальный паритет и приёмка владельца в контейнере не проверены.
