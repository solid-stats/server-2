---
name: wording-spec-file-links-gitlab-url
title: Ссылки на файлы в самой спеке — только полным GitLab blob URL
category: wording
kind: category
severity_when_violated: MEDIUM
applies_to:
  - developer-facing текст спеки (info.description, summary, description методов/схем/параметров/статусов)
  - markdown внутри description-блоков контракта
related:
  - wording-no-internal-paths-leak
  - schema-self-contained-no-external-ref
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical
---

# Ссылки на файлы в самой спеке — только полным GitLab blob URL

> Профильное правило. Явно **переопределяет** core-правило [[wording-no-internal-paths-leak]] для самой спеки: ссылаться на другой файл репозитория из developer-facing контракта **можно**, но исключительно полным GitLab blob URL.

## Правило

Если в человекочитаемом тексте спеки (контракт-YAML) нужно сослаться на другой файл swagger-репозитория, ссылка оформляется **полным GitLab blob URL** вида:

```
https://git.estesis.tech/VocalClub/swagger/-/blob/master/<путь-от-корня-репозитория>
```

Пример: `https://git.estesis.tech/VocalClub/swagger/-/blob/master/changes/002_appeals_api/01_appeals_api.yaml`.

Голый локальный путь (`changes/002_appeals_api/01_appeals_api.yaml`), относительный путь (`../002_appeals_api/...`) или указатель «см. файл X.yaml» — нарушение: читатель контракта не обязан иметь репозиторий локально, а полный URL кликабелен и однозначен.

Правило **не ослабляет** [[schema-self-contained-no-external-ref]] (BLOCKER): внешний `$ref:` по-прежнему запрещён. GitLab URL — это ссылка в прозе/`description`, а не резолвимый `$ref`. Ветка в URL — канонический `master`.

## Когда применяется

- в `description`/`summary` контракта нужно указать на baseline, смежную спеку или исходный файл другого этапа;
- автор переносит «см. соседний файл» из черновика в финальный контракт.

## Как проверить

- Найди в тексте контракта file-подобные токены (`*.yaml`, `*.yml`, `*.md`, пути с `/`): каждый такой токен должен быть частью полного `https://git.estesis.tech/VocalClub/swagger/-/blob/master/...` URL.
- Голый локальный/относительный путь или «см. файл X» → нарушение, заменить на полный URL.
- Убедись, что ссылка стоит в прозе (`description`), а не в `$ref:` — внешний `$ref` остаётся BLOCKER (`schema-self-contained-no-external-ref`).
- URL ведёт на `…/-/blob/master/…` (канонический бранч), путь — от корня репозитория.

## Severity и риск

MEDIUM. Полный URL резолвится и шарится; голый локальный путь оставляет читателя контракта искать артефакт, которого у него нет, и контракт читается как неполный. Та же риск-модель, что у core `wording-no-internal-paths-leak`, но с разрешённой санкционированной формой ссылки.

## Хороший пример

```yaml
description: |
  Источник статусов модерации — контракт сервиса аппеляций:
  https://git.estesis.tech/VocalClub/swagger/-/blob/master/changes/002_appeals_api/01_appeals_api.yaml
```

## Антипример

```yaml
description: |
  Статусы берутся из changes/002_appeals_api/01_appeals_api.yaml (см. соседний файл).
```

Правка: заменить голый путь на полный GitLab blob URL `https://git.estesis.tech/VocalClub/swagger/-/blob/master/changes/002_appeals_api/01_appeals_api.yaml`; формулировку «см. соседний файл» убрать.

## Связанные паттерны

- [[wording-no-internal-paths-leak]] — базовое core-правило; этот профильный паттерн переопределяет его для контракта (URL разрешён, голый путь — нет).
- [[schema-self-contained-no-external-ref]] — без изменений: внешний `$ref` остаётся BLOCKER.

## Заметки для ревьюера

- Сопровождающие документы (`INDEX.md`, `CONTEXT.md`, `CHANGES.md`) ссылаются на файлы свободно, в том числе голыми локальными путями — это правило касается только самой спеки.
- Если URL ведёт не на `master`, а на ветку/коммит — допустимо для временной ссылки, но в финальном контракте предпочтителен `master`.
