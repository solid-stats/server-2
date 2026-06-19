# server-2

**Русский** · [English](README.en.md)

TypeScript-бэкенд и источник правды для **Solid Stats** — статистики игр
сообщества [Solid Games](https://sg.zone) (ArmA 3). Владеет HTTP-API,
бизнес-состоянием в PostgreSQL, канонической идентичностью игроков, входом
через Steam, модерацией, оркестрацией задач парсера и расчётом статистики
и награды за голову.

Часть многорепной платформы: поиск сырых реплеев — в `replays-fetcher`,
парсинг OCAP — в `replay-parser-2`, веб-интерфейс — в `web`, рантайм
и операции — в `infrastructure`. server-2 — слой интеграции, где они
сходятся.

> Solid Stats от и до строят AI-агенты по процессу
> [GSD](https://github.com/open-gsd/gsd-core). Разработка вне GSD — вне процесса.

## Быстрый старт

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres rabbitmq minio minio-create-bucket
pnpm run dev
```

PostgreSQL слушает на хост-порте `15432`, RabbitMQ — на `5673`
(управление `15673`): нестандартные порты выбраны, чтобы не конфликтовать
с локальными сервисами. Перед коммитом гоняйте гейт `pnpm run verify`
(формат, линт, типы, тесты, контракт OpenAPI, границы).

## Документация

- docs/backend-reference.md — рантайм-поверхности, политика контракта, статистика, auth, схема БД
- docs/deployment.md · docs/backup-restore.md — деплой и восстановление
- docs/api-compatibility.md — контракт OpenAPI и генерация типов для `web`
- .planning/ — продуктовый контекст, milestone, роадмап, состояние (GSD)

## Стек

TypeScript 6 · Node 25 · Fastify 5 · PostgreSQL · RabbitMQ · S3 · OpenAPI

## Лицензия — MIT
