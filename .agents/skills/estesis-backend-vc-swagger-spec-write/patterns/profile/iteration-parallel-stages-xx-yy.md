---
name: iteration-parallel-stages-xx-yy
title: Параллельные подэтапы XX_YY должны быть независимы
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - YAML-файлы вида `XX_YY_<scope>_<slug>.yaml`
  - этапы, помеченные в `INDEX.md` как параллельные
related:
  - iteration-stage-numbering
  - iteration-index-md-content
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/020_resource_owned_content_studio/, changes/006_video_lessons/)
---

# Параллельные подэтапы XX_YY должны быть независимы

## Правило

Файлы с одним `XX`, но разными `YY` (`XX_01_*`, `XX_02_*`, ...) обозначают параллельные подэтапы: они независимы друг от друга и могут разрабатываться одновременно. Файл `XX_YY_*` не должен ссылаться на схемы или решения, появляющиеся только в `XX_YZ_*` с другим `YY`. Зависимости разрешены только в сторону предшествующих `XX-1`, `XX-2`, ... этапов той же или более ранней итерации.

## Когда применяется

- в iteration folder есть как минимум два файла `XX_YY_*` с одним `XX`;
- `INDEX.md` Stage Map описывает несколько подэтапов одного `XX`;
- `CONTEXT.md` явно говорит "можно разрабатывать параллельно".

## Как проверить

- Прочитай каждый файл `XX_YY_*` и проверь, что он содержит все нужные ему схемы локально (либо собственные `components.schemas`, либо ссылки на схемы из предыдущих `XX-N` этапов).
- Сверь, что файл `XX_01_*` не ссылается на схемы/operationId/paths, описанные только в `XX_02_*`, и наоборот.
- Сверь с `INDEX.md` и `CONTEXT.md`: если этапы помечены как параллельные, убедись, что в их `description` нет фразы "после этапа XX_YY" или "перед этапом XX_YY".
- Проверь, что `CONTEXT.md` явно проговаривает параллельность для подобных подэтапов (как в `changes/020_resource_owned_content_studio/CONTEXT.md` про `01_01` и `01_02`).

## Severity и риск

MEDIUM. Скрытая зависимость между параллельными подэтапами ломает обещание независимой разработки: команды, взявшие два `XX_YY_*` файла, обнаружат, что один заблокирован другим. Это снижает доверие к Stage Map и приводит к contract drift, потому что один подэтап начинает молча включать решения из соседнего.

## Хороший пример

- `changes/020_resource_owned_content_studio/01_01_resources_studio_results.yaml` и `01_02_calendar_studio_schedule_events.yaml` — два полностью независимых файла; `CONTEXT.md:39-40` явно фиксирует параллельность.
- `changes/006_video_lessons/02_01_resources_shop_library.yaml` и `02_02_resources_reviews.yaml` — параллельные подэтапы в одном `XX`; `INDEX.md:31-33` показывает оба под одним префиксом `02`.
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` и `02_02_resources_exercises_reviews.yaml` — аналогичная схема.

## Антипример

```
changes/030_new_feature/
  01_01_resources_create.yaml
  01_02_resources_list.yaml   # ссылается на schema "FullResource" из 01_01_*
```

Правка: либо вынести `FullResource` в более ранний этап, либо переоформить как последовательные этапы `01_*` и `02_*` вместо параллельных подэтапов.

## Связанные паттерны

- [[iteration-stage-numbering]] — общие правила нумерации этапов.
- [[iteration-index-md-content]] — Stage Map в `INDEX.md` явно отмечает параллельные подэтапы.

## Заметки для ревьюера

- Если подэтапы `XX_YY_*` принадлежат разным сервисам (например, `01_01` для resources и `01_02` для calendar), это сильный сигнал реальной независимости. Уточняй параллельность через `CONTEXT.md` явно.
- Параллельность не означает идентичность контракта: подэтапы могут вводить разные схемы, но они не должны ссылаться друг на друга через `$ref` на схемы, которых нет в общем доступе.
