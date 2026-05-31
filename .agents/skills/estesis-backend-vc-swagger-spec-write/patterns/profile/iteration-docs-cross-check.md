---
name: iteration-docs-cross-check
title: Cross-check c docs/ обязательным образом, особенно product-acceptance-criteria.md
category: iteration
kind: category
severity_when_violated: HIGH
applies_to:
  - любые iteration folders, scope которых пересекается с docs/
  - '`Source Docs` / `Исходные документы` секция `INDEX.md` или `CONTEXT.md`'
related:
  - iteration-acceptance-criteria-coverage
  - iteration-registry-swagger-link
  - iteration-context-md-content
source:
  - references/estesis-profile.md (правило "Папка docs/")
  - empirical (docs/product-acceptance-criteria.md, docs/calendar-service-openapi.json, changes/019_*/, changes/020_*/, changes/022_*/)
---

# Cross-check с docs/ обязательным образом, особенно product-acceptance-criteria.md

## Правило

Перед созданием или изменением постановки сверь scope с релевантными документами из `docs/`, особенно с `docs/product-acceptance-criteria.md`. Если scope итерации пересекается с критериями приемки, явно сошлись на них в `CONTEXT.md` или `INDEX.md` как `Source Docs` / `Исходные документы` и не теряй критерии в YAML-файлах этапов. Если итерация использует или обходит существующий внешний/старый сервис, сохрани его swagger или описание в `docs/` (как `docs/calendar-service-openapi.json` для сервиса Календаря) и сошлись на него.

## Когда применяется

- iteration scope пересекается с продуктовыми критериями приемки;
- итерация заменяет или обходит существующий сервис, у которого есть legacy swagger в `docs/`;
- iteration вводит новый сценарий, для которого `docs/product-acceptance-criteria.md` уже описывает acceptance criteria;
- iteration трогает analytics (см. `docs/analytics/`) или другие domain-specific документы.

## Как проверить

- Открой `docs/product-acceptance-criteria.md` и поиском найди ключевые слова scope итерации (`studio`, `purchase`, `publication`, `label`, `teacher profile`, `karaoke`, и т.п.).
- Сверь acceptance criteria с YAML-файлами этапов: для каждого критерия должен быть либо явный endpoint/поле/edge case, либо явное "out of scope" в `INDEX.md`/`CONTEXT.md`.
- Если итерация трогает сервис Календаря или другой сервис с legacy snapshot в `docs/`, сверь, что `Source Docs` ссылается на этот snapshot.
- Сверь, что секция `Source Docs` / `Исходные документы` в `CONTEXT.md` упоминает все релевантные docs.

## Severity и риск

HIGH. Пропуск критериев приемки означает, что разработчик реализует часть продуктовых требований, а другая часть теряется. Игнорирование legacy swagger (`docs/calendar-service-openapi.json`) приводит к контракту, несовместимому с уже задеплоенным сервисом. Это требует переделки и риска регрессии.

## Хороший пример

- `changes/020_resource_owned_content_studio/CONTEXT.md:11-15` — `Source Docs` явно ссылается на `../../docs/product-acceptance-criteria.md`, `../../docs/calendar-service-openapi.json`, `../../registry/services/resources/SWAGGER.md`.
- `changes/022_resource_publish_lifecycle/INDEX.md:21` — `Source Docs: Product acceptance criteria: ../../docs/product-acceptance-criteria.md`.
- `changes/019_resource_purchased_content/INDEX.md:21-22` — отдельная секция `Source Docs` со ссылкой на acceptance criteria.

## Антипример

```
# 030_new_purchase_feature

## Goal

Add a new buy method for resources.

## Touched Services

- resources

## Registry Links

- resources: ../../registry/services/resources/SWAGGER.md
```

Правка: добавить `Source Docs` со ссылкой на `docs/product-acceptance-criteria.md`; сверить scope с критериями приемки; зафиксировать в `Changed Baselines`, какие критерии приемки покрывает итерация.

## Связанные паттерны

- [[iteration-acceptance-criteria-coverage]] — каждый релевантный acceptance criterion должен быть явно покрыт или явно out of scope.
- [[iteration-registry-swagger-link]] — `Registry Links` + `Source Docs` дополняют друг друга.
- [[iteration-context-md-content]] — `CONTEXT.md` — основное место для ссылок на `docs/`.

## Заметки для ревьюера

- Если в `docs/` появляется новый snapshot legacy сервиса, проверь, что все итерации, ссылающиеся на этот сервис, обновили `Source Docs`.
- Если `docs/product-acceptance-criteria.md` обновился после согласования итерации, обновление критериев должно либо появиться в `CHANGES.md` (с новой записью и `Supersedes`), либо быть out of scope с явным указанием в `INDEX.md`.
- Не дублируй текст из `docs/` в `INDEX.md`/`CONTEXT.md` — ссылайся.
