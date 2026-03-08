import { supabase } from './supabase.js';

const SALT = 'emoji-jumpers-2024';

// Hash a password using SHA-256 (client-side, fine for a game)
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + SALT);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Register a new player — returns { player } or throws an error string
export async function register(username, password) {
  if (!username.trim()) throw 'Username cannot be empty.';
  if (username.length > 20) throw 'Username must be 20 characters or less.';
  if (password.length < 3)  throw 'Password must be at least 3 characters.';

  // Check username is unique
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  if (existing) throw 'That name is already taken — pick another!';

  const hash = await hashPassword(password);
  const { data, error } = await supabase
    .from('players')
    .insert({ username: username.trim(), password_hash: hash })
    .select()
    .single();

  if (error) throw error.message;
  return data;
}

// Log in — returns { player } or throws an error string
export async function login(username, password) {
  const { data: player, error } = await supabase
    .from('players')
    .select()
    .ilike('username', username)
    .maybeSingle();

  if (error)   throw error.message;
  if (!player) throw 'No player found with that name.';

  const hash = await hashPassword(password);
  if (hash !== player.password_hash) throw 'Wrong password — try again!';

  return player;
}

// Save a score after a game (silently skipped if Supabase not configured)
export async function saveScore(playerId, username, score, emoji) {
  if (!supabase) return;
  const { error } = await supabase
    .from('scores')
    .insert({ player_id: playerId, username, score, emoji });
  if (error) console.warn('Could not save score:', error.message);
}

// ─── Leaderboard queries ───────────────────────────────────────────────────

function getDailyCutoff() {
  const now    = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(1, 0, 0, 0);
  if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);
  return cutoff.toISOString();
}

function getWeeklyCutoff() {
  const now    = new Date();
  const cutoff = new Date(now);
  const day    = cutoff.getDay(); // 0=Sun, 1=Mon …
  cutoff.setDate(cutoff.getDate() - (day === 0 ? 6 : day - 1)); // back to Monday
  cutoff.setHours(1, 0, 0, 0);
  if (now < cutoff) cutoff.setDate(cutoff.getDate() - 7);
  return cutoff.toISOString();
}

// Returns top 20 rows: [{ username, emoji, best_score }]
export async function fetchLeaderboard(tab) {
  let query = supabase.from('scores').select('username, score, emoji');

  if (tab === 'daily')  query = query.gte('played_at', getDailyCutoff());
  if (tab === 'weekly') query = query.gte('played_at', getWeeklyCutoff());

  const { data, error } = await query.order('score', { ascending: false });
  if (error) { console.warn(error.message); return []; }

  // Keep only each player's best score
  const best = new Map();
  for (const row of data) {
    if (!best.has(row.username) || row.score > best.get(row.username).score) {
      best.set(row.username, row);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
