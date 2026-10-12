// src/features/movie-lists/api.js  (Supabase version)
// Same exported functions as the testapi.io version, and the same camelCase
// shapes ({ userId, listId, tmdbId }) so MovieLists.jsx should not need changes.
import { supabase } from '../../lib/supabase'

// ---------- helpers ----------

// Turn a Supabase error into a readable message.
// `overrides` lets each function give its own wording for a specific error code.
function errorMessage(error, overrides = {}) {
  if (overrides[error.code]) return overrides[error.code]
  switch (error.code) {
    case '22P02': return 'An ID has the wrong format. Supabase IDs are uuids, not the old testapi.io IDs.'
    case '23502': return 'A required field is missing.'
    case '23503': return 'That item is missing, or other items still depend on it.'
    case '23505': return 'That item already exists.'
    case '23514': return 'A value is not allowed (check name, email, status, or rating 1-10).'
    case '42501': return 'Supabase blocked this (row level security). Check your policies.'
    case '42P01': return 'A Supabase table is missing. Run the SQL setup first.'
    case '42703': return 'A column name is wrong (use snake_case like user_id).'
    default: return error.message || 'Supabase request failed.'
  }
}

function unwrap({ data, error }, overrides) {
  if (error) {
    console.error('Supabase error:', error.code, error.message)
    throw new Error(errorMessage(error, overrides))
  }
  return data
}

// database row (snake_case) -> app shape (camelCase)
function toList(row) {
  return { id: row.id, userId: row.user_id, name: row.name }
}

function toSavedMovie(row) {
  return {
    id: row.id,
    listId: row.list_id,
    tmdbId: String(row.tmdb_id), // the app used strings before
    status: row.status,
    // keep the old behaviour: no rating key when there is no rating
    ...(row.rating == null ? {} : { rating: row.rating }),
  }
}

// '' means "no rating" -> null. Anything else must be 1-10.
function parseRating(value) {
  if (value === '' || value === null || value === undefined) return null
  const rating = Number(value)
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
    throw new Error('Rating must be a number from 1 to 10.')
  }
  return rating
}

// ---------- movie lists ----------

export async function getMovieLists(userId) {
  const data = unwrap(
    await supabase.from('movie_lists').select('*').eq('user_id', userId).order('created_at'),
  )
  return data.map(toList)
}

export async function createMovieList({ userId, name }) {
  const cleanName = name.trim()
  if (!userId) throw new Error('Enter a user ID before creating a list.')
  if (!cleanName) throw new Error('List name cannot be empty.')

  const data = unwrap(
    await supabase.from('movie_lists').insert({ user_id: userId, name: cleanName }).select().single(),
    { 23503: 'That user does not exist.' },
  )
  return toList(data)
}

export async function updateMovieList(id, changes) {
  const patch = {}
  if (changes.name !== undefined) {
    const name = changes.name.trim()
    if (!name) throw new Error('List name cannot be empty.')
    patch.name = name
  }

  const data = unwrap(await supabase.from('movie_lists').update(patch).eq('id', id).select())
  // 0 rows = it doesn't exist (or RLS hid it)
  if (!data.length) throw new Error('The selected item no longer exists.')
  return toList(data[0])
}

export async function deleteMovieList(id) {
  // Friendly pre-check (the database also enforces this with ON DELETE RESTRICT)
  const { count, error } = await supabase
    .from('saved_movies')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', id)
  if (error) throw new Error(errorMessage(error))
  if (count > 0) throw new Error('This list still has saved movies. Remove them before deleting the list.')

  const data = unwrap(
    await supabase.from('movie_lists').delete().eq('id', id).select('id'),
    { 23503: 'This list still has saved movies. Remove them before deleting the list.' },
  )
  if (!data.length) throw new Error('The selected item no longer exists.')
  return null
}

// ---------- saved movies ----------

export async function getSavedMovies(listId) {
  const data = unwrap(
    await supabase.from('saved_movies').select('*').eq('list_id', listId).order('created_at'),
  )
  return data.map(toSavedMovie)
}

export async function createSavedMovie({ listId, tmdbId, status = 'Want to Watch', rating = '' }) {
  if (!listId) throw new Error('Choose a movie list first.')
  const cleanTmdbId = String(tmdbId).trim()
  if (!/^\d+$/.test(cleanTmdbId)) throw new Error('Enter a valid numeric TMDB ID.')

  const row = { list_id: listId, tmdb_id: Number(cleanTmdbId), status }
  const cleanRating = parseRating(rating)
  if (cleanRating !== null) row.rating = cleanRating

  // No need to pre-fetch: the database enforces the foreign key and UNIQUE (list_id, tmdb_id)
  const data = unwrap(await supabase.from('saved_movies').insert(row).select().single(), {
    23505: 'That movie is already saved in this list.',
    23503: 'The selected movie list no longer exists.',
  })
  return toSavedMovie(data)
}

export async function updateSavedMovie(id, changes) {
  const patch = {}
  if (changes.status !== undefined) patch.status = changes.status
  // '' clears the rating (null); undefined leaves it unchanged
  if (changes.rating !== undefined) patch.rating = parseRating(changes.rating)

  const data = unwrap(await supabase.from('saved_movies').update(patch).eq('id', id).select())
  if (!data.length) throw new Error('The selected item no longer exists.')
  return toSavedMovie(data[0])
}

export async function deleteSavedMovie(id) {
  unwrap(await supabase.from('saved_movies').delete().eq('id', id))
  return null
}