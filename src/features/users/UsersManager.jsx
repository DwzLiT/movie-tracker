import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './users.css'

const initialForm = { name: '', email: '' }

function validate({ name, email }) { const errors = {}; if (!name.trim()) errors.name = 'Name is required.'; if (!email.trim()) errors.email = 'Email is required.'; else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email address.'; return errors }

// Turn a Supabase error into a readable message (codes match the SQL file)
function errorMessage(error, overrides = {}) {
  if (overrides[error.code]) return overrides[error.code]
  switch (error.code) {
    case '23502': return 'A required field is missing.'
    case '23514': return 'Name cannot be blank and the email must look valid.'
    case '42501': return 'Supabase blocked this (row level security). Check your policies.'
    case '42P01': return 'The users table is missing. Run the SQL setup first.'
    default: return error.message || 'Supabase request failed.'
  }
}

// Throws a normal Error so the existing catch blocks keep working
function unwrap({ data, error }, overrides) {
  if (error) {
    console.error('Supabase error:', error.code, error.message)
    throw new Error(errorMessage(error, overrides))
  }
  return data
}

export function UsersManager({ onSelectUser, selectedUserId, onBeforeDelete }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const loadUsers = useCallback(async () => { try { setUsers(unwrap(await supabase.from('users').select('*').order('name'))); setError('') } catch (cause) { setError(`Could not load users. ${cause.message}`) } finally { setIsLoading(false) } }, [])
  useEffect(() => { const timerId = window.setTimeout(loadUsers, 0); return () => window.clearTimeout(timerId) }, [loadUsers])
  function selectUser(user) { onSelectUser?.(user) }
  function cancelEdit() { setEditingId(null); setForm(initialForm); setErrors({}) }
  function startEdit(user) { setEditingId(user.id); setForm({ name: user.name ?? '', email: user.email ?? '' }); setErrors({}); selectUser(user) }
  async function submitForm(event) {
    event.preventDefault()
    const nextErrors = validate(form); setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const payload = { name: form.name.trim(), email: form.email.trim() }
    setIsSaving(true); setError('')
    try {
      if (editingId) {
        const rows = unwrap(await supabase.from('users').update(payload).eq('id', editingId).select())
        if (!rows.length) throw new Error('That profile no longer exists.')
        const user = rows[0]
        setUsers((current) => current.map((item) => String(item.id) === String(editingId) ? user : item)); selectUser(user)
      } else {
        const user = unwrap(await supabase.from('users').insert(payload).select().single())
        setUsers((current) => [...current, user]); selectUser(user)
      }
      cancelEdit()
    } catch (cause) { setError(`Could not save user. ${cause.message}`) } finally { setIsSaving(false) }
  }
  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.name}? Movie lists must be deleted first.`)) return
    setDeletingId(user.id); setError('')
    try {
      await onBeforeDelete?.(user)
      const rows = unwrap(
        await supabase.from('users').delete().eq('id', user.id).select('id'),
        { 23503: 'This profile still has movie lists. Delete them first.' },
      )
      if (!rows.length) throw new Error('That profile no longer exists.')
      setUsers((current) => current.filter((item) => String(item.id) !== String(user.id)))
      if (String(selectedUserId) === String(user.id)) selectUser(null)
      if (String(editingId) === String(user.id)) cancelEdit()
    } catch (cause) { setError(`Could not delete user. ${cause.message}`) } finally { setDeletingId(null) }
  }
  return <section className="users-manager" aria-labelledby="users-title">
    <h2 id="users-title">Profiles</h2><p className="users-manager__intro">Choose a profile for this session. This is not secure login.</p>
    <form onSubmit={submitForm} className="users-manager__form" noValidate><h3>{editingId ? 'Edit profile' : 'Create profile'}</h3><label>Name<input name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={Boolean(errors.name)} />{errors.name && <span>{errors.name}</span>}</label><label>Email<input name="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} aria-invalid={Boolean(errors.email)} />{errors.email && <span>{errors.email}</span>}</label><div><button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create profile'}</button>{editingId && <button type="button" className="users-manager__secondary" onClick={cancelEdit}>Cancel</button>}</div></form>
    {error && <p className="users-manager__error" role="alert">{error}</p>}
    {isLoading ? <p role="status">Loading profiles…</p> : users.length === 0 ? <p role="status">No profiles yet. Create one to start saving movies.</p> : <ul className="users-manager__list">{users.map((user) => <li key={user.id} className={String(selectedUserId) === String(user.id) ? 'is-selected' : ''}><button type="button" className="users-manager__select" onClick={() => selectUser(user)} aria-pressed={String(selectedUserId) === String(user.id)}><strong>{user.name}</strong><span>{user.email}</span></button><div><button type="button" onClick={() => startEdit(user)}>Edit</button><button type="button" onClick={() => deleteUser(user)} disabled={deletingId === user.id}>Delete</button></div></li>)}</ul>}
  </section>
}