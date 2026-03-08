<script>
  import { onMount } from 'svelte';
  import { fetchLeaderboard } from './lib/auth.js';

  export let onBack;   // callback to return to game
  export let player;   // current logged-in player

  let tab     = 'alltime';   // 'alltime' | 'weekly' | 'daily'
  let rows    = [];
  let loading = true;

  async function load(t) {
    tab     = t;
    loading = true;
    rows    = await fetchLeaderboard(t);
    loading = false;
  }

  onMount(() => load('alltime'));

  const TABS = [
    { key: 'alltime', label: 'All Time' },
    { key: 'weekly',  label: 'Weekly'   },
    { key: 'daily',   label: 'Daily'    },
  ];

  const MEDALS = ['🥇','🥈','🥉'];
</script>

<div class="screen">
  <div class="card">
    <button class="back" on:click={onBack}>← Back</button>

    <h1>🏆 Leaderboard</h1>

    <!-- Tab bar -->
    <div class="tabs">
      {#each TABS as t}
        <button
          class="tab"
          class:active={tab === t.key}
          on:click={() => load(t.key)}
        >{t.label}</button>
      {/each}
    </div>

    <!-- Scores -->
    <div class="list">
      {#if loading}
        <p class="empty">Loading…</p>
      {:else if rows.length === 0}
        <p class="empty">No scores yet — be the first! 🦤</p>
      {:else}
        {#each rows as row, i}
          <div class="row" class:me={row.username === player?.username}>
            <span class="rank">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span class="emoji">{row.emoji}</span>
            <span class="name">{row.username}</span>
            <span class="score">{row.score}</span>
          </div>
        {/each}
      {/if}
    </div>

    <p class="reset-note">
      {#if tab === 'daily'}
        Resets daily at 1:00 AM
      {:else if tab === 'weekly'}
        Resets every Monday at 1:00 AM
      {:else}
        Never resets 🏅
      {/if}
    </p>
  </div>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    background: linear-gradient(to bottom, #06082a, #1a1a5a);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: sans-serif;
  }

  .card {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px;
    padding: 1.5rem;
    width: min(460px, 95vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    color: white;
    overflow: hidden;
  }

  .back {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 0.9rem;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }
  .back:hover { color: white; }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    text-align: center;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
  }

  .tab {
    flex: 1;
    padding: 0.55rem;
    border-radius: 10px;
    border: 2px solid rgba(255,255,255,0.2);
    background: transparent;
    color: rgba(255,255,255,0.6);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab.active {
    background: #FFD700;
    border-color: #FFD700;
    color: #000;
  }
  .tab:not(.active):hover { border-color: rgba(255,255,255,0.5); color: white; }

  .list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 200px;
  }

  .empty {
    text-align: center;
    color: rgba(255,255,255,0.4);
    margin-top: 2rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
  }
  .row.me {
    background: rgba(255,215,0,0.15);
    border: 1px solid rgba(255,215,0,0.4);
  }

  .rank  { width: 2rem; text-align: center; font-size: 1.1rem; }
  .emoji { font-size: 1.3rem; }
  .name  { flex: 1; font-weight: 600; font-size: 0.95rem; }
  .score {
    font-size: 1.1rem;
    font-weight: 700;
    color: #FFD700;
    font-family: 'Fredoka One', monospace;
    font-size: 0.85rem;
  }

  .reset-note {
    text-align: center;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.4);
    margin: 0;
  }
</style>
