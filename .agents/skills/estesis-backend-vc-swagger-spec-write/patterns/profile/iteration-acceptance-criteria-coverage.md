---
name: iteration-acceptance-criteria-coverage
title: Не теряй критерии приемки в YAML-файлах этапов
category: iteration
kind: category
severity_when_violated: HIGH
applies_to:
  - YAML-файлы этапов, scope которых пересекается с `docs/product-acceptance-criteria.md`
  - '`CONTEXT.md` и `INDEX.md` итераций с продуктовым acceptance criteria'
related:
  - iteration-docs-cross-check
  - iteration-context-md-content
source:
  - references/estesis-profile.md (правило про docs/product-acceptance-criteria.md)
  - empirical (docs/product-acceptance-criteria.md, changes/019_*/, changes/020_*/)
---

# Не теряй критерии приемки в YAML-файлах этапов

## Правило

Каждый релевантный acceptance criterion из `docs/product-acceptance-criteria.md` должен быть явно покрыт либо endpoint/field/edge case в YAML-файлах этапов, либо явно отмечен как out of scope в `INDEX.md` / `CONTEXT.md`. Постановка не должна молча терять критерии приемки, относящиеся к scope задачи. Если acceptance criterion переносится в более позднюю итерацию, это нужно зафиксировать как явное "будущее расширение" в `CONTEXT.md` или `INDEX.md`.

## Когда применяется

- iteration scope явно или неявно пересекается с продуктовыми критериями приемки;
- ревью обнаруживает endpoint без описания edge case, который есть в `docs/product-acceptance-criteria.md`;
- ревизия добавляет/убирает endpoint, который связан с product acceptance criteria;
- пользователь подтверждает или ограничивает scope итерации.

## Как проверить

- Открой `docs/product-acceptance-criteria.md` и поищи ключевые слова scope: `studio`, `publication`, `purchase`, `label`, `teacher`, `redZone`, и т.п.
- Для каждого критерия, попадающего в scope, сверь, что он покрыт либо как endpoint/field/edge case в YAML, либо как explicit "out of scope" в `INDEX.md`/`CONTEXT.md`.
- Если критерий покрыт частично (например, только для `lesson`, но не для `exercise`), убедись, что это явно отмечено как "future extension" в `CONTEXT.md` (как в `changes/020_*/CONTEXT.md:37-38` для `type: exercise`).
- Сверь критерии приемки с `Changed Baselines`: каждый baseline, который меняется ради acceptance criterion, должен быть в списке.

## Severity и риск

HIGH. Потеря acceptance criteria приводит к недоразумению с продуктовой командой и переделке. Чем длиннее `docs/product-acceptance-criteria.md`, тем выше риск, что несколько критериев тихо выпадут из scope.

## Хороший пример

- `changes/020_resource_owned_content_studio/CONTEXT.md:36-50` — детально перечисляет, какие acceptance criteria покрыты в текущей итерации (сохранение результата, расписание, запуск программы) и какие явно out of scope (упражнения в результатах, subscription limits, teacher review).
- `changes/022_resource_publish_lifecycle/CONTEXT.md` — явно фиксирует acceptance scope: только `exercise`, `lesson`, `program`, `videoLesson`.
- `changes/019_resource_purchased_content/INDEX.md:55-60` — `Changed Baselines` явно перечисляет acceptance criteria для покупки, поиска и связи с источником.

## Антипример

```
# 030_studio_results — YAML

POST /api/v1/studio/results:
  summary: Save studio result
  description: Saves a studio result.   # critical edge case "validate scheduleItemId before save" not described
```

Правка: добавить описание edge case в `description` метода или соответствующего статуса ответа, либо явно отметить в `CONTEXT.md`, что edge case откладывается на следующую итерацию.

## Связанные паттерны

- [[iteration-docs-cross-check]] — `docs/` обязательно сверять; этот паттерн дополнительно требует фактического покрытия критериев.
- [[iteration-context-md-content]] — out of scope явно фиксируется в `CONTEXT.md`.

## Заметки для ревьюера

- Если acceptance criterion помечен в `docs/product-acceptance-criteria.md` как "MVP", его нельзя молча перенести в "future extension" — нужен явный supersedes в `CHANGES.md`.
- Если разработчик утверждает, что критерий out of scope, проверь, что это решение зафиксировано (CHANGES.md или CONTEXT.md "out of scope" пункт), а не оставлено только в переписке.
- Если scope ограничен по technical reason (например, "только для `lesson`, потому что `exercise` сейчас не имеет результата"), запиши причину в `CONTEXT.md`.
