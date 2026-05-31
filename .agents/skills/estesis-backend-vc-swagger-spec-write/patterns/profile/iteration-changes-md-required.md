---
name: iteration-changes-md-required
title: CHANGES.md обязателен для согласованных изменений контракта
category: iteration
kind: category
severity_when_violated: HIGH
applies_to:
  - '`changes/XXX_*/CHANGES.md`'
  - любая правка YAML-файла этапа после первого согласования
related:
  - iteration-context-md-content
  - iteration-index-md-content
source:
  - references/estesis-profile.md (folder and iteration workflow, behavioral defaults)
  - empirical (changes/019_resource_purchased_content/CHANGES.md, changes/020_resource_owned_content_studio/CHANGES.md)
---

# CHANGES.md обязателен для согласованных изменений контракта

## Правило

Если в итерации появляется согласованное изменение уже написанной постановки (контракт, naming, payload/response, порядок этапов, роли, доступы, edge cases, совместимость), это изменение обязательно фиксируется в `changes/XXX_*/CHANGES.md` — до или одновременно с правкой YAML-файла этапа. `CHANGES.md` не заменяет `INDEX.md`, `CONTEXT.md` и YAML-файлы этапов; он отдельно фиксирует каждое решение как анти-drift журнал. Каждая запись содержит дату, краткий заголовок, набор `Применяется к` (файлы и пути в YAML), описание изменения, `Причина` и `Supersedes` (если есть).

## Когда применяется

- кто-то правит YAML-файл этапа в iteration folder, где уже есть `CHANGES.md`;
- пользователь просит изменить уже согласованное решение;
- проводится повторное ревью и возникают новые исправления контракта;
- кто-то добавляет супер-итерацию (например, новый etap или поле), которая логически меняет ранее принятое решение.

## Как проверить

- Сравни git diff YAML-файла с последними записями `CHANGES.md`. Каждое смысловое изменение должно быть отражено как запись.
- Сверь заголовки записей в `CHANGES.md`: формат `## YYYY-MM-DD — <заголовок>`, после которого идет маркированный список с `Применяется к`, описанием, `Причина`/`Reason`, `Supersedes`/`Заменяет` (опционально).
- Если пользователь просит откатить активное решение, проверь, что в `CHANGES.md` появилась новая запись с явным `Supersedes` старого решения.
- Сверь, что описанные в `CHANGES.md` пути и схемы существуют в YAML.

## Severity и риск

HIGH. Отсутствие `CHANGES.md` или пропуск записи приводит к contract drift: при следующей итерации команда не понимает, что какие-то поля или edge cases уже были осознанно изменены, и откатывает их обратно. Это особенно опасно в long-living итерациях (как `020_resource_owned_content_studio` с 942 строками CHANGES.md), где несколько раундов ревью наслоились друг на друга.

## Хороший пример

- `changes/019_resource_purchased_content/CHANGES.md` — каждый раздел `## YYYY-MM-DD —` содержит `Applies to`, `Reason`, `Supersedes`; явно помечены `Status: superseded` для откатанных решений.
- `changes/020_resource_owned_content_studio/CHANGES.md` — обширный журнал с supersedes-цепочками между датами, где одно решение последовательно вытесняет другое.
- `changes/023_music_label_display_drafts/CHANGES.md` — короткий, но строго по формату: `## 2026-05-18 — <title>`, `Applies to`, `Reason`, `Supersedes`.

## Антипример

```
# 030_new_feature — Changes

Updated 01.yaml to add new field "foo".
Removed "bar" field after discussion.
```

Правка: каждое изменение оформить отдельной датированной секцией с явными `Applies to`, `Reason` и `Supersedes`, иначе невозможно восстановить, что именно и почему было решено.

## Связанные паттерны

- [[iteration-context-md-content]] — `CONTEXT.md` хранит финальное состояние решений; `CHANGES.md` хранит историю.
- [[iteration-index-md-content]] — `Supersedes` в `INDEX.md` ссылается на iteration folders, `Supersedes` в `CHANGES.md` — на конкретные решения.

## Заметки для ревьюера

- Ранние iteration folders (`001`-`012`) не имеют `CHANGES.md`. Это исторические исключения; не требуй создавать его задним числом, если итерация уже принята (`Status: Accepted`). Для итераций со статусом `Draft`/`Черновик` `CHANGES.md` обязателен при первой правке после первоначального коммита.
- Если в новой записи нет `Supersedes`, явно говори об этом — это означает, что последующие правки обязаны сохранять активные решения из `CHANGES.md` без отката.
- Допустим как русский, так и английский формат записей внутри одной итерации (см. `019_*/CHANGES.md` на английском и `020_*/CHANGES.md` на русском). Не меняй язык в существующих файлах ради единообразия.
