---
name: wording-studio-lowercase
title: '"Студия" в обычном тексте пишется с маленькой буквы'
category: wording
kind: category
severity_when_violated: NIT
applies_to:
  - '`info.description`, `summary`, `description` методов/схем/параметров'
  - 'markdown-контекст в `description: |`'
  - тексты `CONTEXT.md`, `CHANGES.md`, `INDEX.md`
related:
  - wording-russian-default
  - wording-english-where-allowed
source:
  - references/wording-registry.md ("Доменную часть 'студия' в обычном тексте пиши с маленькой буквы")
  - empirical (changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml)
---

# "Студия" в обычном тексте пишется с маленькой буквы

## Правило

Доменное слово "студия" в человекочитаемом тексте пишется с маленькой буквы: "расписание студии", "результаты студии", "дашборд студии", "состояние студии". Технические идентификаторы (`Studio`, `studio`, `StudioResult`, `/api/v1/studio/results`, tag `Studio Schedule`) к правилу не относятся и сохраняют исходный регистр.

## Когда применяется

- любая постановка из домена `studio`;
- особенно `summary`, `description`, `responses[*].description` и markdown-контекст методов студии.

## Как проверить

- `rg -n "[Сс]тудия|[Сс]тудии|[Сс]тудию" changes/<folder>` — кандидаты.
- Если слово в начале предложения с заглавной — это OK по грамматике; правило про маленькую букву применяется к словам в середине фразы.
- Если слово находится в backtick или upper-case `Studio` (`\`Studio Results\``, путь `/api/v1/studio/...`, schema `StudioResult`) — это технический идентификатор и под правило не попадает.
- Проверь, что не образуется гибрид типа "Studio расписание" — должен быть либо технический `Studio` целиком, либо русское "расписание студии".

## Severity и риск

NIT. Незначительная стилистическая ошибка, которая не ломает контракт. Падает в общий стилевой контроль читаемости и консистентности.

## Хороший пример

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:6` — "Фасад расписания студии, запуска и отмены купленных программ.".
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:19` — `summary: Сохранить результат студии с учетом расписания` (с маленькой "с" в "студии").
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:62` — "элементы расписания студии текущего пользователя".
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:170` — "купленное занятие в расписание студии текущего пользователя".

## Антипример

Гипотетическое нарушение в новой постановке:

```yaml
summary: Сохранить результат Студии
description: |
  Загружает результат Студии и возвращает его. Используется для расписания Студии.
```

Корректный вариант: `summary: Сохранить результат студии`, description: "Загружает результат студии и возвращает его. Используется для расписания студии."

Также неверно писать "Студия Результаты" как русскоязычный заголовок; если хочется русифицировать tag — оставляй tag английским (`Studio Results`), а в `summary` пиши "результаты студии" (см. `wording-english-where-allowed`).

## Связанные паттерны

- [[wording-russian-default]] — общий принцип русского по умолчанию.
- [[wording-english-where-allowed]] — почему tag `Studio Results` остается с заглавной.

## Заметки для ревьюера

- Если слово используется в начале предложения, заглавная буква оправдана грамматически: "Студия текущего пользователя содержит максимум 5 активных программ." — это OK.
- Не предлагать переименование путей `/api/v1/studio/...`, тегов `Studio Schedule`, схем `StudioResult`, полей вроде `studioResultId` — они на английском по другому правилу.
- Падает в NIT и обычно объединяется с другими wording-нитами в одну группу findings.
