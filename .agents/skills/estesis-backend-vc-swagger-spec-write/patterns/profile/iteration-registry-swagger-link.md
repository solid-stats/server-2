---
name: iteration-registry-swagger-link
title: Registry SWAGGER.md обязателен для каждого затронутого сервиса
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - '`Registry Links` / `Registry-ссылки` секция в `INDEX.md`'
  - '`CONTEXT.md` со ссылками на исходные документы'
related:
  - iteration-index-md-content
  - iteration-docs-cross-check
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (registry/services/*, changes/020_resource_owned_content_studio/INDEX.md)
---

# Registry SWAGGER.md обязателен для каждого затронутого сервиса

## Правило

`Registry Links` / `Registry-ссылки` в `INDEX.md` обязан содержать ссылку на `registry/services/<service>/SWAGGER.md` для каждого затронутого сервиса. Если у сервиса нет deployed swagger (файл `SWAGGER.md` отсутствует или пустой), это значит, что сервис еще не задеплоили или ссылка неизвестна — это нужно явно отметить в `INDEX.md` (например, "ссылка на развернутый Swagger неизвестна; текущий базовый контракт зафиксирован в `docs/<service>-service-openapi.json`"). Не выдумывай ссылки, которых нет в registry. Перед созданием постановки всегда проверь `registry/services/<service>/SWAGGER.md`.

## Когда применяется

- создается или ревизируется `INDEX.md` для итерации с `Touched Services`;
- появилась новая ссылка на deployed swagger или ссылка изменилась;
- сервис мигрировал с docs-snapshot на deployed swagger или наоборот.

## Как проверить

- Открой `registry/services/` и сверь, что для каждого сервиса из `Touched Services` существует папка с `SWAGGER.md`.
- Открой `SWAGGER.md` каждого затронутого сервиса. Если файл пустой или содержит "no local implementation specs yet" / "none", `INDEX.md` должен это явно отразить (пометка "none" или ссылка на `docs/<service>-service-openapi.json`).
- Сверь `Registry Links` со списком `Touched Services`: они должны соответствовать.
- Не позволяй ссылки на external Swagger UI или произвольные URL — допустимы только `../../registry/services/<service>/SWAGGER.md` или `docs/<file>` ссылки.

## Severity и риск

MEDIUM. Без registry-ссылки backend-разработчик не понимает, где смотреть baseline-контракт сервиса. Несуществующая или закрытая ссылка хуже, чем явное "ссылка неизвестна": она создает ложное впечатление, что baseline где-то задокументирован.

## Хороший пример

- `changes/006_video_lessons/INDEX.md:17-18` — `resources: ../../registry/services/resources/SWAGGER.md` — простой случай.
- `changes/020_resource_owned_content_studio/INDEX.md:19-21` — отдельно фиксирует, что для сервиса Календаря `ссылка на развернутый Swagger неизвестна; текущий базовый контракт зафиксирован в ../../docs/calendar-service-openapi.json`.
- `changes/001_shared_status_errors/INDEX.md:17-18` — для `shared` явно `shared: none`.

## Антипример

```
## Registry Links

- resources: https://my-swagger-ui.example.com/resources
- songs: TODO
```

Правка: заменить произвольный URL на `../../registry/services/resources/SWAGGER.md`; вместо `TODO` либо добавить файл в registry, либо явно отметить, что сервис не задеплоен.

## Связанные паттерны

- [[iteration-index-md-content]] — `Registry Links` — обязательная секция `INDEX.md`.
- [[iteration-docs-cross-check]] — `docs/` хранит docs-snapshot для сервисов без deployed swagger.

## Заметки для ревьюера

- Для шаренных итераций (`shared`) ссылка обычно отсутствует — допустимо `shared: none`.
- Если у iteration есть несколько затронутых сервисов, перечисли каждую registry-ссылку отдельной строкой.
- Сервисы `audioProcessing` и `auth` имеют `SWAGGER.md` в registry, но пока нет iteration folders, ссылающихся на них. При появлении новой итерации с этими сервисами обязательно добавь Registry Link.
