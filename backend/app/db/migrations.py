from __future__ import annotations

from app.db.sqlite_db import connect


def run_migrations() -> None:
    with connect() as conn:
        conn.executescript(
            """
            create table if not exists snapshots (
                id text primary key,
                timestamp text,
                screenshotPath text,
                thumbnailPath text,
                appName text,
                windowTitle text,
                screenHash text,
                ocrText text,
                ocrStatus text,
                ocrError text,
                imageEmbeddingStatus text,
                createdAt text
            );
            create table if not exists app_settings (
                key text primary key,
                value text
            );
            create table if not exists excluded_apps (
                id text primary key,
                appName text,
                createdAt text
            );
            create table if not exists excluded_window_patterns (
                id text primary key,
                pattern text,
                createdAt text
            );
            create table if not exists text_chunks (
                id text primary key,
                snapshotId text,
                chunkText text,
                chunkIndex integer,
                createdAt text
            );
            create index if not exists idx_snapshots_timestamp on snapshots(timestamp);
            create index if not exists idx_snapshots_hash on snapshots(screenHash);
            """
        )
