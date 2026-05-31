---
name: auth-anonymous-shop-response
title: Поведение полей при анонимном запросе на public shop endpoint
category: security
kind: category
severity_when_violated: HIGH
applies_to:
  - shop endpoints (`GET /api/v1/shop/*`)
  - публичные detail endpoints с current-user полями
  - response fields `isPurchased`, `isCreatedByMe`, `bestSuitedFragment`, `price.*`
related:
  - security-do-not-add-security-clause-for-optional-auth
  - auth-public-read-private-write
  - feature-shop-vs-studio
source:
  - backend-vc-swagger-spec-write/references/core-conventions.md (security clauses)
  - empirical (changes/014_*, changes/016_*, changes/017_*)
---

# Поведение полей при анонимном запросе на public shop endpoint

## Правило

Когда public endpoint содержит поля, которые персонализируются по optional bearer token, в описании каждого такого поля или в `description` ответа явно укажи поведение для анонимного запроса. Стандартные правила:
- `isPurchased = false`.
- `isCreatedByMe = false`.
- `bestSuitedFragment = null` (для exercises) или эквивалент.
- `price.total`, `price.embeddedResources` считаются как будто пользователь не владеет ни одним из платных embedded ресурсов.

Невалидный или отсутствующий bearer token равен анонимному запросу.

## Когда применяется

- Endpoint описан как public + optional bearer token (см. [[security-do-not-add-security-clause-for-optional-auth]]).
- Response содержит current-user fields: `isPurchased`, `isCreatedByMe`, `bestSuitedFragment`, `price.total`, и т.п.
- CONTEXT.md итерации содержит фразы вроде "Anonymous shop responses set `isPurchased = false`".
- Path содержит `/shop/`.

## Как проверить

- Найти в YAML public shop endpoint без блока `security`.
- В response schema проверить поля с современной семантикой:
  - `isPurchased: { description: ... }` — в description должно явно фигурировать поведение для anonymous shop ("In anonymous shop responses, always false." или эквивалент).
  - `isCreatedByMe: ...` — аналогично.
  - `bestSuitedFragment` — поведение `null` для anonymous.
  - `price.embeddedResources` или `price.total` — расчет для anonymous (как будто ничего не куплено).
- В `description` метода или `200`-ответа должна быть фраза, что отсутствующий или невалидный bearer token считается анонимным запросом.
- CONTEXT.md итерации должен содержать ту же договоренность (anonymous shop semantics).
- CHANGES.md итерации может зафиксировать это решение явно (например, `changes/016_lessons_resources/CHANGES.md:171-175`).

## Severity и риск

HIGH: без явной фиксации анонимного поведения разработчик может вернуть `null` или ошибку при пустом токене, а фронтенд получит несогласованный ответ. Также anonymous price calculation влияет на витрину и monetization: ошибка приводит к показу неверной цены и провалу purchase flow.

## Хороший пример

- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:508-509` — `isPurchased: ... For anonymous shop responses, always false.`
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:514-515` — `bestSuitedFragment: ... For anonymous shop responses, always null.`
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:618-624` — `isPurchased`, `isCreatedByMe` для анонимного запроса.
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:855-861` — `price.embeddedResources`, `price.total` для анонимного запроса.
- `changes/016_lessons_resources/CONTEXT.md:40` — формулировка anonymous shop semantics.
- `changes/016_lessons_resources/CHANGES.md:171-175` — журнал согласования anonymous behavior.

## Антипример

```yaml
ShopExercise:
  type: object
  properties:
    isPurchased:
      type: boolean
      description: True when the current user has purchased this exercise.   # <- нет anonymous case
    bestSuitedFragment:
      $ref: '#/components/schemas/Fragment'   # <- не nullable, нет anonymous case
```

Правка:

```yaml
isPurchased:
  type: boolean
  description: True when the current user has purchased this exercise. For anonymous shop responses, always false.
bestSuitedFragment:
  anyOf:
    - $ref: '#/components/schemas/Fragment'
    - type: 'null'
  description: Full best suited fragment for the current user, or `null`. For anonymous shop responses, always `null`.
```

## Связанные паттерны

- [[security-do-not-add-security-clause-for-optional-auth]] — endpoint остается без `security`.
- [[auth-public-read-private-write]] — anonymous semantics — это про public read половину пары.
- [[feature-shop-vs-studio]] — anonymous price recalculation (другая категория).

## Заметки для ревьюера

- В iteration где есть owned library endpoints (`/library/...`), anonymous behavior к ним не применяется — там нет optional bearer; токен обязателен.
- Для admin endpoints anonymous behavior тем более не применяется.
- Если CONTEXT.md явно описывает anonymous semantics, нарушение часто живет не в самом контракте, а в неполных field descriptions. Проверь все current-user fields на каждом public endpoint.
- Описывай anonymous поведение в полях, а не дублируй в каждом методе. Метод-уровень может сослаться на правило одной фразой, но детали должны быть в полях.
