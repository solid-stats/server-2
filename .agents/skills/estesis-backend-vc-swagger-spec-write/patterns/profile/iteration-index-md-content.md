---
name: iteration-index-md-content
title: Обязательный контент INDEX.md
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - '`changes/XXX_*/INDEX.md`'
related:
  - iteration-context-md-content
  - iteration-changed-baselines-link
  - iteration-registry-swagger-link
  - iteration-depends-on-not-numeric
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/006_video_lessons/INDEX.md, changes/020_resource_owned_content_studio/INDEX.md)
---

# Обязательный контент INDEX.md

## Правило

Каждый `changes/XXX_*/INDEX.md` обязан содержать компактную карту изменений со следующими разделами:

- заголовок `# XXX_<slug>`;
- `Goal` / `Цель` — одна-две строки про бизнес-цель итерации;
- `Status` / `Статус` — `Draft`/`Черновик` или `Accepted`/`Принято`;
- `Touched Services` / `Затронутые сервисы` — список service-id;
- `Registry Links` / `Registry-ссылки` — ссылка на `registry/services/<service>/SWAGGER.md` для каждого затронутого сервиса;
- `Depends On` / `Зависит от` — список iteration folder, от которых зависит, или `none`;
- `Supersedes` / `Что заменяет` — список superseded iteration folders или `none`;
- `Stage Map` / `Карта этапов` — таблица с колонками префикс, файлы, сервисы, краткое описание;
- `Changed Baselines` / `Измененные базовые контракты` — список baseline-изменений.

`INDEX.md` заменяет прежний `DIFF.md`. Не используй имя `DIFF.md` для новых iteration folders.

## Когда применяется

- создается новая iteration folder;
- ревизируется существующая `INDEX.md`;
- появилась новая зависимость, superseded решение или новый этап.

## Как проверить

- Открой `changes/XXX_*/INDEX.md` и убедись, что все обязательные секции присутствуют.
- Сверь `Touched Services` со scope из `CONTEXT.md` и со списком service-id в именах YAML-файлов этапов.
- Сверь `Registry Links` со списком `Touched Services`: для каждого упомянутого сервиса должна быть либо ссылка на `registry/services/<service>/SWAGGER.md`, либо явная пометка, что сервис еще не задеплоили / ссылка неизвестна (см. `changes/020_*/INDEX.md:21` для примера для сервиса Календаря, для которого используется `docs/calendar-service-openapi.json`).
- Сверь `Stage Map` со списком YAML-файлов в папке: каждой строке должен соответствовать существующий файл и наоборот.
- Сверь `Changed Baselines` с `CHANGES.md` (если он есть): активные согласованные изменения базовых контрактов должны быть отражены в обоих документах.

## Severity и риск

MEDIUM. Без полноценного `INDEX.md` итерация теряет навигационный entry point: разработчик не понимает, в каком статусе постановка, какие сервисы затронуты, какие baseline-изменения предполагаются и какие итерации она заменяет. Это приводит к contract drift и дублированию работы.

## Хороший пример

- `changes/006_video_lessons/INDEX.md` — компактный, со всеми разделами и явным "each next stage assumes all previous stages of this iteration already exist".
- `changes/020_resource_owned_content_studio/INDEX.md` — подробный INDEX с расширенными `Changed Baselines`, описанием параллельных подэтапов, ссылкой на `docs/calendar-service-openapi.json`.
- `changes/022_resource_publish_lifecycle/INDEX.md` — пример простой итерации с одним этапом, все секции на месте.

## Антипример

```
# 030_some_feature

## Цель

Что-то про новые методы.

## Файлы

- 01_resources_thing.yaml
- 02_resources_other_thing.yaml
```

Правка: добавить `Status`, `Touched Services`, `Registry Links`, `Depends On`, `Supersedes`, `Stage Map` как таблицу и `Changed Baselines`.

## Связанные паттерны

- [[iteration-context-md-content]] — `CONTEXT.md` хранит доменный контекст; `INDEX.md` — это карта изменений.
- [[iteration-changed-baselines-link]] — раздел `Changed Baselines` фиксирует связь с baseline-контрактами других итераций.
- [[iteration-registry-swagger-link]] — раздел `Registry Links` обязан указывать на актуальные SWAGGER.md.
- [[iteration-depends-on-not-numeric]] — раздел `Depends On` важнее, чем номер папки.

## Заметки для ревьюера

- Допустима двуязычность: ранние итерации используют англоязычные заголовки (`Goal`, `Status`), поздние — русские (`Цель`, `Статус`). Не меняй язык в старых файлах ради единообразия.
- Если итерация полностью schema-only (как `012_song_schemas` или `021_resource_voice_range`), `Stage Map` все равно обязателен — пусть и с одной строкой.
- `Supersedes: none` пишется явно, не оставляй пустым.
