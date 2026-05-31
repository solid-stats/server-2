---
name: iteration-context-md-content
title: Обязательный контент CONTEXT.md
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - '`changes/XXX_*/CONTEXT.md`'
related:
  - iteration-index-md-content
  - iteration-changes-md-required
  - iteration-docs-cross-check
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/006_video_lessons/CONTEXT.md, changes/020_resource_owned_content_studio/CONTEXT.md)
---

# Обязательный контент CONTEXT.md

## Правило

Каждый `changes/XXX_*/CONTEXT.md` хранит общее доменное знание, которое нужно всем YAML-файлам этапов этой итерации. Он должен содержать как минимум:

- цель/motivation/scope итерации;
- ссылки на исходные документы (`docs/product-acceptance-criteria.md`, `docs/calendar-service-openapi.json`, `registry/services/<service>/SWAGGER.md`, dependency iteration folders);
- роли и права доступа (таблица или маркированный список);
- доменные/бизнес-правила, общие для нескольких этапов;
- таблицу `Shared schemas` / `Общие схемы` с указанием, в каких этапах схема используется;
- список файлов и список этапов с порядком разработки.

`CONTEXT.md` — это shared knowledge для всей итерации; specific endpoint detail должен жить в `description` поля/параметра/статуса в YAML, а не в `CONTEXT.md`.

## Когда применяется

- создается новая iteration folder;
- меняется shared schema, которая используется в нескольких этапах;
- появляется новая роль, право доступа или бизнес-правило, общее для нескольких этапов.

## Как проверить

- Открой `CONTEXT.md` и сверь обязательные секции.
- Сверь таблицу `Shared schemas` со списком YAML-файлов: каждый этап, упомянутый в колонке `Used in stages`, должен фактически использовать схему.
- Сверь ссылки на исходные документы с реальным содержимым `docs/` и `registry/services/`.
- Если `CONTEXT.md` содержит API-specific детали уровня одного метода (статусы 400, отдельные поля), это smell — такие детали должны жить в YAML, а не в `CONTEXT.md`.

## Severity и риск

MEDIUM. Без `CONTEXT.md` каждый YAML-файл этапа становится самостоятельным "островом", и разработчик не получает общий доменный контекст: роли, бизнес-правила, дамп shared schemas. Это приводит к contract drift между этапами (например, разный `redZone` в `01_01` и `02`, разный `ScheduleItem.resource` в списке и деталях).

## Хороший пример

- `changes/006_video_lessons/CONTEXT.md` — компактный, с ролями, доменными правилами, shared schemas, файлами и этапами.
- `changes/020_resource_owned_content_studio/CONTEXT.md` — большой `CONTEXT.md`, с расширенным разделом "Решения", интеграционным разделом про сервис Календаря, разделом "Результаты и повтор", таблицей общих схем.
- `changes/021_resource_voice_range/CONTEXT.md` — schema-only итерация, `CONTEXT.md` содержит детальный раздел "Calculation Rules" и таблицу частот для timbre coverage.

## Антипример

```
# 030_new_feature — Context

This folder has YAML files.

## Files

- 01_resources_thing.yaml
```

Правка: добавить scope/цель, роли, доменные правила, исходные документы, таблицу shared schemas, явный список этапов.

## Связанные паттерны

- [[iteration-index-md-content]] — `INDEX.md` — карта изменений; `CONTEXT.md` — доменный контекст.
- [[iteration-changes-md-required]] — согласованные изменения contract попадают в `CHANGES.md`, не в `CONTEXT.md`.
- [[iteration-docs-cross-check]] — `CONTEXT.md` ссылается на `docs/product-acceptance-criteria.md` и аналогичные документы.

## Заметки для ревьюера

- Если итерация ссылается на сервис, у которого нет deployed `registry/services/<service>/SWAGGER.md`, ссылка должна идти на `docs/<service>-service-openapi.json` или на explicit pinned source, а не оставаться пустой.
- Если `CONTEXT.md` начинает дублировать содержимое `CHANGES.md` (даты, supersedes), это smell — переноси такие записи в `CHANGES.md`.
- Допустимо использовать английский в старых iteration folders; не переписывай ради единообразия.
