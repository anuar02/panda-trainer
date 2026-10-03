# SOM-41 · Чистый контракт экспорта локальных несинхронизированных данных

Linear: https://linear.app/something-great/issue/SOM-41

## Контекст

Server export и pure deletion preflight влиты. Серверный snapshot не сохраняет
local pending/rejected/conflict/correction. Этот пакет — изолированный typed serializer
для будущего экспорта пользователем, без collector/storage/UI/delete integration.
Work начинает после текущего export UI; его новые native adapters не менять.

## Критерии

- [ ] Версионный pure local export envelope: account/workspace/session snapshot metadata,
  точные операции/projections и обе конфликтующие версии/correction drafts, явная
  полнота источников. Input unknown строго валидируется, unknown не означает zero.
- [ ] UUID/scope/revisions/sequence/units/null/0/UTF-8 сохраняются без потерь;
  deterministic ordering и bounded size/count, duplicate/foreign/malformed fail closed.
  Payload только разрешённых journal operation/projection форм из текущих контрактов,
  не произвольный JSON и не credentials. Local notes — только явно scoped пользовательские
  данные; отсутствие источника/версии отмечается incomplete, а не успешным backup.
- [ ] Serializer не создаёт export/ack proof для preflight, не подтверждает сохранение
  файла/личность, не authorize delete. Server export не объединяется с local успехом.
- [ ] Tests round-trip exact grams/reps/seconds/null/zero, unicode notes, rejected/conflict/
  correction, обе версии, duplicate/foreign scope/unknown/incomplete/limits/credentials.
- [ ] Technical handoff: какой snapshot collector ещё нужен, атомарность чтения при
  конкурентном save/ack, безопасное сохранение/очистка и proof после реального file result.
  Не выбирать UX/политику удаления или retention за владельца.

## Источники

AGENTS/app AGENTS, LINEAR-AGENT-GUIDE; docs/app/README, CONVENTIONS, PROJECT-MEMORY,
ROADMAP checkpoint, DELIVERY-PLAN, OPEN-QUESTIONS, UI-PARITY, ADR0007/0061/0062/0064/0066;
privacy/ACCOUNT-DELETION-HANDOFF.md, DELETION-PREFLIGHT-CONTRACT.md;
domain/workout-sync и SQLite outbox только читать, account-deletion/account-export
контракты только читать. Graft если доступен.

## Границы

Только новый app/src/domain/account-local-export/, отдельные tests,
docs/app/privacy/LOCAL-EXPORT-CONTRACT.md, минимальная ссылка из deletion handoff.
Не менять существующие domain/account-deletion/account-export/workout-sync,
features/UI/auth/storage/SQLite/runner, SQL/types/dependencies, policy/DATA-LIFECYCLE.
Runtime collector и purge не создавать. Third меняет journal: опираться только на
уже влитые типы базы, не на его незавершённую ветку.

## Проверка и отчёт

- [ ] cd app && npm run check зелёный, CHANGELOG («Не выпущено»), минимальный ROADMAP,
  app/review/som-41-local-export-contract/README.md; ADR при новом подходе.
- [ ] App без комментариев/any/секретов/новых PNG.

Нет Docker/Supabase/браузера/устройств: реальный SQLite snapshot/reopen/crash/file API,
SQL/native/cloud/legal/owner acceptance не объявлять проверенными. Только synthetic fixtures,
без платных сервисов/реальных данных. Не задавать вопросов, не менять Linear/scripts/rules/main.
Draft PR agent/som-41-local-export-contract только в fix/som-50-template-picker,
заголовок SOM-41. Весь SOM-41 и экраны принятыми не объявлять.
