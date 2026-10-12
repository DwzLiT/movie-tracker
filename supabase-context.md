# MovieMatch project context for Supabase SQL generation

## Project summary
MovieMatch is a React 19 + Vite movie discovery and personal collection MVP. TMDB supplies movie discovery and metadata. The current persistence layer is testapi.io (not Supabase); this document describes the existing data contract and the likely relational Supabase schema. Generate PostgreSQL/Supabase SQL that preserves this behavior unless asked otherwise. The selected profile is only a prototype convenience and is NOT authentication.

## Existing entities and fields
The app currently expects three collections:

1. `users`
   - `id`: generated identifier (currently supplied by testapi.io)
   - `name`: required, non-empty text
   - `email`: required text; UI validates a basic email shape
2. `movieLists` (suggested SQL table: `movie_lists`)
   - `id`: generated identifier
   - `userId` (SQL `user_id`): required reference to `users.id`
   - `name`: required, trimmed, non-empty text
3. `savedMovies` (suggested SQL table: `saved_movies`)
   - `id`: generated identifier
   - `listId` (SQL `list_id`): required reference to `movie_lists.id`
   - `tmdbId` (SQL `tmdb_id`): required numeric TMDB movie ID; currently stored as a string in JSON, but suitable as PostgreSQL `bigint`
   - `status`: required text; allowed app values are exactly `Want to Watch` and `Watched`; new rows default to `Want to Watch`
   - `rating`: optional personal rating from 1 through 10; blank means absent/null

## Relationships and behavior
- One user has many movie lists (`movie_lists.user_id`).
- One list has many saved movies (`saved_movies.list_id`).
- A TMDB movie may be saved in different lists, but should not appear twice in the same list. Use `UNIQUE (list_id, tmdb_id)`.
- The UI currently requires lists to be deleted before a user can be deleted. Saved movies must be removed before their list can be deleted; the UI explicitly deletes saved movie rows first. Preserve this behavior with `ON DELETE RESTRICT` (or require explicit child deletion) unless asked to change it.
- Names are trimmed in the client. Consider `CHECK (length(trim(name)) > 0)`.
- Rating is optional; if provided, enforce `CHECK (rating BETWEEN 1 AND 10)`.
- Discovery filters, search terms, genres, posters, release dates, overviews, and TMDB vote average come from TMDB and are not currently stored in the app database. The app stores only the TMDB movie ID for each saved movie, then fetches movie details from TMDB.
- Personal notes are not currently supported/stored. Do not add a notes field unless requested; README describes it as a possible future nullable text column.
- No created/updated timestamps are currently used by the client. They may be added as conventional DB metadata if appropriate, but should not be mistaken for required app fields.

## Supabase guidance
- Use snake_case SQL identifiers (`movie_lists`, `saved_movies`, `user_id`, `list_id`, `tmdb_id`) even though the existing JSON keys use camelCase.
- Recommend `uuid` primary keys with `gen_random_uuid()` for a new standalone schema. If migrating rows from testapi.io, account for existing string IDs and map references consistently instead of silently assuming they are UUIDs.
- IMPORTANT identity choice: the current `users` are user-created profiles, not Supabase Auth users. Do not reference `auth.users` unless the request explicitly changes the app to real Supabase authentication. If adopting Supabase Auth, explain that this requires an app/auth migration and an ownership policy design.
- SQL schema creation alone does not enable the current frontend to use Supabase. The app presently fetches testapi.io REST URLs; a Supabase client/service migration is separate. Avoid suggesting that setting SQL up automatically connects the app.
- For a learning/prototype database, state assumptions around Row Level Security. Do not enable broad anonymous write access as a default. If writing policies, explain who should be allowed to read/write profile and collection rows and ensure list/movie ownership checks follow `movie_lists.user_id`.

## Relevant project files
- `src/features/users/UsersManager.jsx`: profile fields, create/edit/delete behavior and validation.
- `src/features/movie-lists/api.js`: collection payload fields, defaults, uniqueness check, rating validation and delete restrictions.
- `src/features/movie-lists/MovieLists.jsx`: list and saved movie UI behavior.
- `src/features/movie-discovery/tmdbClient.js`: TMDB requests and metadata retrieval.
- `README.md`: current testapi.io setup and high-level behavior.

## SQL generation instructions for another LLM
When asked to write SQL for this project:
1. Target Supabase PostgreSQL syntax.
2. Keep SQL simple and beginner-readable; include comments where useful.
3. State assumptions, especially profile identity vs Supabase Auth and RLS/access model.
4. Preserve the three-entity relationships and app value constraints above.
5. Avoid storing full TMDB movie metadata unless specifically requested; the canonical external key is `tmdb_id`.
6. Include foreign keys, sensible indexes, and the per-list unique constraint when creating tables.
7. If asked only for a query or alteration, provide only the needed SQL and mention any important migration/app-code impact.
