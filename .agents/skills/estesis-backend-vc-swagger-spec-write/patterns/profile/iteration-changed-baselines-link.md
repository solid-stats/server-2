---
name: iteration-changed-baselines-link
title: Changed Baselines связывают новую итерацию с baseline-контрактами
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - '`Changed Baselines` секция в `INDEX.md`'
  - итерации, расширяющие или ограничивающие baseline-контракты других итераций
related:
  - iteration-index-md-content
  - iteration-no-rewriting-old-folders
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/019_resource_purchased_content/INDEX.md, changes/022_resource_publish_lifecycle/INDEX.md, changes/023_music_label_display_drafts/INDEX.md)
---

# Changed Baselines связывают новую итерацию с baseline-контрактами

## Правило

Секция `Changed Baselines` / `Измененные базовые контракты` в `INDEX.md` обязательна и содержит компактный список того, как новая итерация меняет baseline-контракты других итераций, сервисов или предположений. Каждая строка фокусируется на одном baseline-изменении (поле, схема, endpoint, behavior, edge case). Если новая итерация ничего не меняет в baseline-контрактах (например, чистый schema-only или совершенно изолированный сервис), напиши `- none`.

## Когда применяется

- создается новая iteration folder, расширяющая существующий сервис;
- итерация добавляет или меняет поле, схему, endpoint, статус ответа в уже существующем контракте;
- итерация снимает прежние ограничения или вводит новые edge cases;
- итерация ссылается на dependency iterations через `Depends On`.

## Как проверить

- Сверь содержимое `Changed Baselines` со списком `Depends On` и `Supersedes`: каждая dependency iteration, в которую вносятся правки, должна быть упомянута в `Changed Baselines`.
- Сверь `Changed Baselines` с `CHANGES.md` (если есть): активные согласованные решения, меняющие baseline, должны быть отражены в `Changed Baselines`.
- Сверь, что упомянутые в `Changed Baselines` поля/схемы/endpoint действительно описаны в YAML-файлах этапов новой итерации.
- Проверь, что строки не повторяют все содержимое YAML — `Changed Baselines` это карта изменений baseline, а не полное описание контракта.

## Severity и риск

MEDIUM. Без `Changed Baselines` ревьюер не понимает, какие именно baseline-контракты должны быть обновлены, и читателю приходится сравнивать YAML-файлы новой итерации с YAML старых итераций вручную. Это особенно опасно, когда новая итерация снимает старые ограничения (например, "isPublished" больше не запрещает edit) — отсутствие явного списка приводит к тому, что разработчик не понимает, какие гарантии нарушаются.

## Хороший пример

- `changes/019_resource_purchased_content/INDEX.md:46-60` — подробный список baseline-изменений: новая таблица `purchasedResources`, миграция existing per-resource purchase records, repeated buy → `409`, `sourceId` как historical relation, удаление cart/checkout.
- `changes/022_resource_publish_lifecycle/INDEX.md:44-51` — точно фиксирует, что меняется в edit/delete/publication behavior для всех resource types.
- `changes/023_music_label_display_drafts/INDEX.md:38-43` — связывает новую итерацию с `005_music_labels_api`, `013_label_public_songs`, `018_music_label_appeal_drafts` и явно говорит, что admin by-appeal reads остаются без изменений.

## Антипример

```
# 030_new_feature

## Changed Baselines

- Adds new endpoints
- Updates some schemas
```

Правка: переписать как конкретные строки: какие именно baseline-контракты меняются, в каких dependency iterations они жили, какие новые edge cases появляются, какие старые ограничения снимаются.

## Связанные паттерны

- [[iteration-index-md-content]] — `Changed Baselines` — обязательная секция `INDEX.md`.
- [[iteration-no-rewriting-old-folders]] — изменения baseline не выполняются правкой старых iteration folders, а фиксируются в `Changed Baselines` новой папки.

## Заметки для ревьюера

- `Changed Baselines: none` допустимо, но редко: даже шаренные иттерации обычно фиксируют как минимум один baseline (например, новый общий формат ошибок).
- Если `Changed Baselines` содержит больше 15 строк, это сигнал, что итерация делает слишком много — рассмотри разделение на отдельные iteration folders.
- Не путай `Changed Baselines` с `Supersedes`: `Supersedes` указывает на полностью замененные итерации/решения, `Changed Baselines` — на конкретные точечные изменения.
