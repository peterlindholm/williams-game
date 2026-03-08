<script>
  import { register, login } from './lib/auth.js';

  export let onLogin; // callback(player)

  let mode     = 'login';   // 'login' | 'register'
  let username = '';
  let password = '';
  let error    = '';
  let loading  = false;

  async function submit() {
    error   = '';
    loading = true;
    try {
      const player = mode === 'register'
        ? await register(username, password)
        : await login(username, password);
      onLogin(player);
    } catch (e) {
      error = typeof e === 'string' ? e : 'Something went wrong — try again.';
    } finally {
      loading = false;
    }
  }

  function toggleMode() {
    mode = mode === 'login' ? 'register' : 'login';
    error = '';
  }
</script>

<div class="screen">
  <div class="card">
    <div class="title">
      <span class="gold">Emoji</span>
      <span class="white">Jumpers</span>
    </div>
    <div class="subtitle">🦤</div>

    <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>

    <form on:submit|preventDefault={submit}>
      <label>
        <span>Username</span>
        <input
          type="text"
          bind:value={username}
          maxlength="20"
          autocomplete="username"
          placeholder="Your name"
          disabled={loading}
          required
        />
      </label>

      <label>
        <span>Password</span>
        <input
          type="password"
          bind:value={password}
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="••••••"
          disabled={loading}
          required
        />
      </label>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <button type="submit" class="primary" disabled={loading}>
        {loading ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>

    <button class="toggle" on:click={toggleMode} disabled={loading}>
      {mode === 'login'
        ? "Don't have an account? Register"
        : 'Already have an account? Log in'}
    </button>
  </div>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    background: linear-gradient(to bottom, #5BC8F5, #C9EEFF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: sans-serif;
  }

  .card {
    background: rgba(0, 20, 60, 0.75);
    border-radius: 20px;
    padding: 2rem 2.5rem;
    width: min(420px, 92vw);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .title {
    font-size: 2rem;
    font-weight: 900;
    letter-spacing: 1px;
  }
  .gold  { color: #FFD700; }
  .white { color: white; margin-left: 0.4rem; }

  .subtitle { font-size: 2.5rem; margin: 0.2rem 0; }

  h2 {
    margin: 0.8rem 0 0.4rem;
    font-size: 1.1rem;
    color: rgba(255,255,255,0.85);
    font-weight: 600;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    margin-top: 0.4rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.7);
  }

  input {
    padding: 0.65rem 0.9rem;
    border-radius: 10px;
    border: 2px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.12);
    color: white;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s;
  }
  input:focus { border-color: #FFD700; }
  input::placeholder { color: rgba(255,255,255,0.35); }

  .error {
    color: #FF6B6B;
    font-size: 0.85rem;
    margin: 0;
    text-align: center;
  }

  .primary {
    padding: 0.75rem;
    border-radius: 12px;
    border: none;
    background: #FFD700;
    color: #000;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.2s;
    margin-top: 0.3rem;
  }
  .primary:hover:not(:disabled) { opacity: 0.85; }
  .primary:disabled { opacity: 0.5; cursor: default; }

  .toggle {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 0.82rem;
    cursor: pointer;
    margin-top: 0.6rem;
    text-decoration: underline;
  }
  .toggle:hover { color: white; }
</style>
