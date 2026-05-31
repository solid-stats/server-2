---
name: feature-baseline-changes
title: Изменение baseline через новую iteration с CHANGES.md и Supersedes
category: iteration
kind: feature
severity_when_violated: HIGH
applies_to:
  - постановки, которые меняют уже принятый контракт другой iteration
  - постановки, добавляющие "Supersedes" в INDEX
related:
  - feature-drafts-flow
  - feature-publish-lifecycle
source:
  - references/estesis-profile.md (правила про CHANGES.md, INDEX.md, supersedes)
  - empirical (changes/019_resource_purchased_content/CHANGES.md, changes/020_resource_owned_content_studio/CHANGES.md, changes/022_resource_publish_lifecycle/CHANGES.md)
---

# Изменение baseline через новую iteration с CHANGES.md и Supersedes

## Правило

Если новая постановка меняет уже принятый контракт, не переписывай старую iteration. Создавай новую numbered папку в `changes/`, фиксируй цели в `INDEX.md` (включая `Depends On`, `Supersedes`, `Changed Baselines`), храни общий доменный контекст в `CONTEXT.md` и журналируй каждое согласованное изменение в `CHANGES.md` той же iteration. Записи в `CHANGES.md` обязательны до или одновременно с правкой YAML-файлов этапов и должны явно ссылаться на затронутые файлы, причину (request пользователя или ревью) и `Supersedes` ссылку на ранее активные решения, если такие есть.

## Когда применяется

Триггеры:
- В `INDEX.md` есть `Supersedes` блок с непустым содержанием.
- Iteration трогает endpoint, schema, naming или behavior, которое уже описано в более ранней iteration.
- Reviewer видит, что новая iteration ломает совместимость со старой.

## Как проверить

- В iteration folder присутствует `CHANGES.md`, если iteration меняет старый baseline. Без `CHANGES.md` любая правка YAML, которая отменяет старое решение, — drift.
- Каждая запись `CHANGES.md` содержит: дату, краткое название, applied к файлам, причину (например, "пользователь уточнил..." или "ревью показало..."), и явное `Supersedes` для отмененных решений.
- `INDEX.md` имеет блок `Supersedes` со ссылками на iterations/endpoints, behavior которых отменен.
- `INDEX.md` имеет блок `Changed Baselines` с перечислением фактических контракт-изменений (поля, статусы, endpoint paths).
- Старые iteration folders НЕ переписываются ради новой постановки. Если кто-то меняет 014 потому что 022 ввел published guard — это нарушение профиля (`references/estesis-profile.md`).
- Cross-iteration depends оформляются через `Depends On`, не через external `$ref`. Все нужные schemas/fields повторяются в текущем YAML самодостаточно (см. core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`) правила про self-contained YAML).
- При переоткрытии уже принятого решения в той же iteration новая запись в `CHANGES.md` должна явно отметить, что предыдущая запись `Supersedes`. Не "удаляй" старую запись.

## Severity и риск

HIGH: contract drift без CHANGES.md приводит к тому, что повторные ревью теряют контекст. Старые решения "молча" уходят, разработчик в текущей iteration реализует одно, а реальное намерение клиента было другое. Также нарушается reproducibility: переключение между ревью одной и той же iteration в разное время дает разные feedback.

## Хороший пример

- `changes/019_resource_purchased_content/CHANGES.md` — полный журнал решений с датами, applied paths, reasons и явными `Supersedes`. Несколько раз менялась форма purchase list — каждая смена явно отменяет предыдущую.
- `changes/020_resource_owned_content_studio/CHANGES.md` — большие блоки CHANGES describing калибровку Календаря, инвариант `status/resultId`, унификацию запроса результата; каждый блок ссылается на предыдущие активные решения.
- `changes/022_resource_publish_lifecycle/CHANGES.md` — компактный CHANGES для отдельной lifecycle iteration; явно фиксирует, что прежнее edit behavior 014/016/017 superseded только для published source.
- `changes/022_resource_publish_lifecycle/INDEX.md:33-37` — блок `Supersedes` явно перечисляет отмененные behaviors предыдущих iterations.
- `changes/019_resource_purchased_content/INDEX.md:30-38` — `Supersedes` блок для cart/checkout iteration и старых per-resource purchase tables.

## Антипример

```text
changes/014_exercises_resources/
├── INDEX.md
├── CONTEXT.md
├── 01_resources_exercises_create_delete.yaml    # <-- ВНЕЗАПНО изменена: добавлен 409 для published
├── 02_01_resources_exercises_shop_library.yaml
├── 02_02_resources_exercises_reviews.yaml
└── 03_resources_exercises_admin.yaml
```

Правка:

1. Создать новую iteration `XXX_resource_publish_lifecycle` с следующим глобальным индексом без пропусков.
2. В новой папке `INDEX.md` явно перечислить `Supersedes` (старое edit-разрешенное behavior для published source).
3. В новой папке `CHANGES.md` зафиксировать причину и `Supersedes`.
4. Stage YAML новой iteration описывает только новые ветки (`409` guard + publication=false hard-delete).
5. Старая 014 остается без изменений как baseline.

## Связанные паттерны

- [[feature-drafts-flow]] — переход на Actual/Draft форму музыкальных меток (023) — пример supersedes старого contract внутри 005.
- [[feature-publish-lifecycle]] — 022 — пример новой iteration с явным supersedes старого edit behavior нескольких ресурсных iterations.

## Заметки для ревьюера

- `XXX` — это глобальный исторический индекс, не dependency order. Iteration 022 (depending on 014/016/017) исторически появилась позже, и это нормально.
- Удаленные iteration folders (например, 024 calendar generic cleanup) фиксируются в CHANGES активной iteration (020), которая поглотила scope, с явным `Supersedes`.
- Не дублируй CHANGES в `CONTEXT.md` — `CONTEXT.md` хранит итоговое состояние решений (current truth), `CHANGES.md` — журнал переходов.
- Внутри одной iteration все YAML и markdown файлы должны быть согласованы. Запись в CHANGES без правки YAML — это незавершенное изменение, повод для ревью.
