---
name: iteration-changes-md-supersedes-no-silent-revert
title: Активные решения CHANGES.md не откатываются без явного supersedes
category: iteration
kind: category
severity_when_violated: HIGH
applies_to:
  - любые правки YAML-файлов этапов в iteration folder с `CHANGES.md`
  - повторные раунды ревью одной и той же итерации
related:
  - iteration-changes-md-required
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/019_resource_purchased_content/CHANGES.md, changes/020_resource_owned_content_studio/CHANGES.md)
---

# Активные решения CHANGES.md не откатываются без явного supersedes

## Правило

Перед редактированием YAML-файлов этапов всегда читай `CHANGES.md`, если он есть. Если правка меняет ранее согласованное активное решение, в `CHANGES.md` обязана появиться новая запись с явным указанием `Supersedes` (на номер/дату/заголовок прежнего решения). При отсутствии явного supersedes последующие правки обязаны сохранять все активные решения из `CHANGES.md` без отката. Решение помечается активным, если его не вытеснила более поздняя запись (`Status: superseded`).

## Когда применяется

- редактируешь YAML-файл этапа в iteration folder с `CHANGES.md`;
- проводишь ревью изменений и видишь правку, противоречащую активной записи в `CHANGES.md`;
- пользователь просит "вернуть как было", не указав явно, какое решение supersedes;
- изменение naming, schema shape, edge case или access rule противоречит уже зафиксированному решению.

## Как проверить

- Для каждой правки YAML найди связанное активное решение в `CHANGES.md` (поиск по имени поля, схемы или пути).
- Если правка противоречит активной записи (значение поля, наличие endpoint, edge case), проверь, что в `CHANGES.md` появилась новая запись с пометкой `Supersedes` на старую.
- Сверь, что у superseded записи проставлен `Status: superseded` или эквивалентная отметка (как в `changes/019_resource_purchased_content/CHANGES.md:33`: "Status: superseded by the later 2026-05-19 decision...").
- Если разработчик просто молча убрал что-то, что было активно описано в `CHANGES.md` — это нарушение независимо от severity самого изменения.

## Severity и риск

HIGH. Молчаливый откат активного решения разрушает анти-drift гарантию `CHANGES.md`. На следующей итерации команда восстанавливает ровно ту же ошибку, которую `CHANGES.md` уже один раз исправил. Тем сложнее восстановить хронологию, чем длиннее `CHANGES.md`.

## Хороший пример

- `changes/019_resource_purchased_content/CHANGES.md:13-22` — запись "Replace unified purchased-resources list with per-type purchase history methods" явно supersedes "Replace purchased-resources resource oneOf with a common card" из того же дня.
- `changes/020_resource_owned_content_studio/CHANGES.md:131-144` — масштабный supersedes "Полная переработка сервиса Календаря в 020 и удаление 024" последовательно отменяет несколько предыдущих решений с цитатой каждого.
- `changes/023_music_label_display_drafts/CHANGES.md:1-13` — запись "Move draft metadata to top-level Draft schemas" явно supersedes "the earlier same-day nested `draft` metadata object" и "compact `lastAppeal` item/list decisions".

## Антипример

```
# CHANGES.md

## 2026-05-20 — initial design

- Applies to 01.yaml: field `foo` is required.

## 2026-05-22 — small fix

- Removed `foo` from 01.yaml.   # нет Supersedes на 2026-05-20
```

Правка: переписать запись от 2026-05-22 как "Supersedes the 2026-05-20 decision that made `foo` required. Reason: ..." и явно отметить старую запись `Status: superseded` либо ссылаться на нее по дате/заголовку.

## Связанные паттерны

- [[iteration-changes-md-required]] — каждый change обязан попадать в `CHANGES.md`; этот паттерн дополнительно требует явный supersedes для откатов.

## Заметки для ревьюера

- Не каждая правка — supersedes. Если правка просто добавляет новое поле или новый edge case, который не противоречит активной записи, supersedes не нужен.
- Если активная запись описывает решение в одной строке, supersedes может быть к одной фразе ("supersedes the 2026-05-15 decision that kept `resourceUpdatedAtAtPurchase`"). Главное — явная отсылка, а не молчаливое противоречие.
- Если несколько активных решений сразу теряют силу, перечисли все. Не объединяй их одним общим "supersedes previous design".
