# Wording registry (Estesis)

Locale and house-style rules for human-readable text. Apply in `title`, `summary`, `description`, markdown context, and comments. Do **not** rename technical identifiers — paths, `operationId`, schema names, field names, enum values, `$ref`, file names stay as-is.

These rules back the profile's locale patterns (`wording-russian-default`, `wording-replacement-registry`, `wording-service-names`, `wording-studio-lowercase`, `wording-english-where-allowed`) and the core wording patterns.

## Language default

- Write specs in Russian. Use English only where it must stay technically exact: API terms, field names, enum values, `operationId`, paths, HTTP/status semantics, payload examples, and other contract parts.
- In human-readable `title`/`summary`/`description`/markdown/comments, avoid English phrases when a clear Russian equivalent exists. Don't write hybrids like `Calendar Service`, `resources studio schedule flow`, `legacy-compatible patch`.
- Service names in prose go in Russian: "сервис Календаря", "сервис Ресурсов", "сервис Авторизации". Service ids (`calendar`, `resources`, `auth`) stay only in technical positions (paths, registry links, file names, `$ref`, code values).
- OpenAPI `tags` stay in English.
- Write the domain word "студия" lowercase in ordinary prose.

## Term replacement registry

Apply in human-readable text; never rename technical identifiers:

| Term | Russian (by context) |
| --- | --- |
| `publish` / `published` | "опубликовать", "публикация", "опубликованный" |
| `unpublish` / `unpublished` | "снять с публикации", "снятие с публикации", "неопубликованный" |
| `source` | "оригинальный" / "оригинальный ресурс" |
| `Shop` / `shop` / `витрина` | "магазин" (with the right word form) |
| `request` | "запрос" |
| `request body` | "тело запроса" |
| `body` | "тело" |
| `response` | "ответ" |
| `update` | "редактировать" / "обновить" |
| `stage` | "этап" |
| `step` | "шаг" |
| `method` | "метод" |
| `fragment` | "фрагмент" |
| `mutation` | "изменение" |
| `calendar` | "календарь" (with the right word form) |
| `event` / `events` | "ивент" / "событие" (with the right word form) |

## Paragraph formatting

In a `description: |` block, create a new rendered UI paragraph only with a blank line (two newlines). A single newline is for source-file readability only and must not imply a new paragraph (core `wording-paragraph-empty-line`).

## Conciseness

Keep descriptions concise and informative; don't add filler. Don't duplicate a `default` value already declared in the schema (core `wording-laconic-style`, `wording-no-default-duplication`).
