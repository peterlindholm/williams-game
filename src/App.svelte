<script>
  import { onMount }   from 'svelte';
  import Auth          from './Auth.svelte';
  import Game          from './Game.svelte';
  import Leaderboard   from './Leaderboard.svelte';

  let screen = 'loading';   // 'loading' | 'auth' | 'game' | 'leaderboard'
  let player = null;        // { id, username }

  onMount(() => {
    const saved = localStorage.getItem('ej_player');
    if (saved) {
      try { player = JSON.parse(saved); } catch {}
    }
    screen = player ? 'game' : 'auth';
  });

  function onLogin(p) {
    player = p;
    localStorage.setItem('ej_player', JSON.stringify({ id: p.id, username: p.username }));
    screen = 'game';
  }

  function onLogout() {
    player = null;
    localStorage.removeItem('ej_player');
    screen = 'auth';
  }

  function showLeaderboard() { screen = 'leaderboard'; }
  function backToGame()      { screen = 'game'; }
</script>

{#if screen === 'loading'}
  <!-- blank while we check localStorage -->

{:else if screen === 'auth'}
  <Auth {onLogin} />

{:else if screen === 'leaderboard'}
  <Leaderboard onBack={backToGame} {player} />

{:else}
  <Game {player} {onLogout} {showLeaderboard} />
{/if}
