<script>
  import { onMount, onDestroy } from 'svelte';

  // ─── Canvas setup ─────────────────────────────────────────────────────────
  let canvas;
  let ctx;
  let animationId;
  let W, H;

  // Offscreen canvas for the bird emoji (avoids transparency bug with flipped fillText)
  let birdCanvas, birdCtx;

  // ─── Game settings ─────────────────────────────────────────────────────────
  const GRAVITY       = 0.5;     // How fast the dodo falls
  const FLAP_POWER    = -10;     // How high it jumps per flap
  const BIRD_SIZE     = 44;      // Emoji size in pixels
  const PIPE_WIDTH    = 70;      // How wide each pipe is
  const PIPE_GAP      = 190;     // Vertical gap between top and bottom pipe
  const PIPE_SPEED    = 3;       // How fast pipes scroll left
  const PIPE_INTERVAL = 95;      // Frames between new pipes

  // ─── State ─────────────────────────────────────────────────────────────────
  let gameState = 'start';       // 'start' | 'playing' | 'dead'
  let score     = 0;
  let best      = 0;
  let frame     = 0;

  // ─── Bird ──────────────────────────────────────────────────────────────────
  let bird = { x: 0, y: 0, vy: 0 };

  // ─── Pipes ─────────────────────────────────────────────────────────────────
  let pipes = [];

  // ─── Start / restart ───────────────────────────────────────────────────────
  function init() {
    W = canvas.width;
    H = canvas.height;

    bird   = { x: W * 0.25, y: H * 0.42, vy: 0 };
    pipes  = [];
    frame  = 0;
    score  = 0;
    gameState = 'start';
  }

  // ─── Flap! ─────────────────────────────────────────────────────────────────
  function flap() {
    if (gameState === 'start') { gameState = 'playing'; bird.vy = FLAP_POWER; return; }
    if (gameState === 'dead')  { init(); return; }
    bird.vy = FLAP_POWER;
  }

  // ─── Add a new pipe ────────────────────────────────────────────────────────
  function spawnPipe() {
    const minTop = H * 0.12;
    const maxTop = H * 0.72 - PIPE_GAP;
    const gapTop = minTop + Math.random() * (maxTop - minTop);
    pipes.push({ x: W, gapTop, scored: false });
  }

  // ─── Collision between bird and one pipe ───────────────────────────────────
  function hits(p) {
    const margin = 6; // a little forgiveness
    const bl = bird.x - BIRD_SIZE / 2 + margin;
    const br = bird.x + BIRD_SIZE / 2 - margin;
    const bt = bird.y - BIRD_SIZE / 2 + margin;
    const bb = bird.y + BIRD_SIZE / 2 - margin;

    if (br < p.x || bl > p.x + PIPE_WIDTH) return false; // not in x range
    return bt < p.gapTop || bb > p.gapTop + PIPE_GAP;    // in gap or not?
  }

  // ─── Update game state each frame ─────────────────────────────────────────
  function update() {
    frame++;

    // On the start screen the bird gently bobs up and down
    if (gameState === 'start') {
      bird.y = H * 0.42 + Math.sin(frame * 0.06) * 14;
      return;
    }

    if (gameState !== 'playing') return;

    // Apply gravity
    bird.vy += GRAVITY;
    bird.y  += bird.vy;

    // Hit ceiling → bounce off
    if (bird.y - BIRD_SIZE / 2 < 0) {
      bird.y  = BIRD_SIZE / 2;
      bird.vy = 0;
    }

    // Hit floor → die
    if (bird.y + BIRD_SIZE / 2 >= H - 25) {
      gameOver(); return;
    }

    // Spawn pipes on interval
    if (frame % PIPE_INTERVAL === 0) spawnPipe();

    // Move pipes, score, collide
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED;

      if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
        p.scored = true;
        score++;
      }

      if (p.x + PIPE_WIDTH < 0) { pipes.splice(i, 1); continue; }

      if (hits(p)) { gameOver(); return; }
    }
  }

  function gameOver() {
    gameState = 'dead';
    if (score > best) best = score;
  }

  // ─── Draw everything ────────────────────────────────────────────────────────
  function draw() {
    // Reset canvas state at the start of every frame
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5BC8F5');
    sky.addColorStop(1, '#C9EEFF');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Ground
    ctx.fillStyle = '#6DBE45';
    ctx.fillRect(0, H - 25, W, 25);
    ctx.fillStyle = '#4A8F2F';
    ctx.fillRect(0, H - 8, W, 8);

    // Pipes
    pipes.forEach(drawPipe);

    // Bird (dodo 🦤) — tilt with velocity
    ctx.save();
    const tilt = Math.max(-0.4, Math.min(bird.vy * 0.055, 0.6));
    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt);
    ctx.scale(-1, 1); // flip horizontally so dodo faces right
    // Use drawImage (not fillText) — fillText with emoji on a flipped context
    // goes transparent in Chrome; drawImage handles it correctly
    ctx.drawImage(birdCanvas, -BIRD_SIZE, -BIRD_SIZE, BIRD_SIZE * 2, BIRD_SIZE * 2);
    ctx.restore();

    // Score (top centre — only while playing or after death)
    if (gameState !== 'start') {
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.font         = 'bold 44px sans-serif';
      ctx.strokeStyle  = 'rgba(0,0,0,0.25)';
      ctx.lineWidth    = 4;
      ctx.strokeText(score, W / 2, 18);
      ctx.fillStyle    = 'white';
      ctx.fillText(score, W / 2, 18);
    }

    // ── Start screen ──────────────────────────────────────────────────────────
    if (gameState === 'start') {
      const cx = W / 2;

      // Dark panel behind the title
      const panelW = Math.min(480, W * 0.88);
      const panelH = 190;
      const panelX = cx - panelW / 2;
      const panelY = H * 0.18;

      ctx.fillStyle = 'rgba(0, 20, 60, 0.60)';
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 22);
      ctx.fill();

      // Title line 1
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#FFD700';
      ctx.font         = `bold ${Math.min(46, panelW * 0.12)}px sans-serif`;
      ctx.fillText("William's", cx, panelY + panelH * 0.32);

      // Title line 2
      ctx.font      = `bold ${Math.min(52, panelW * 0.135)}px sans-serif`;
      ctx.fillStyle = 'white';
      ctx.fillText('Flying Game', cx, panelY + panelH * 0.68);

      // Pulsing "tap to start" prompt
      const pulse = 0.6 + Math.sin(frame * 0.07) * 0.4;
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.font      = '22px sans-serif';
      ctx.fillText('Tap or press Space to start', cx, H * 0.78);
    }

    // ── Game Over overlay ─────────────────────────────────────────────────────
    if (gameState === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;

      ctx.fillStyle    = '#FFD700';
      ctx.font         = 'bold 28px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText("William's Flying Game 🦤", cx, cy - 120);

      ctx.fillStyle    = 'white';
      ctx.font         = 'bold 52px sans-serif';
      ctx.fillText('Game Over', cx, cy - 70);

      ctx.font = '30px sans-serif';
      ctx.fillText(`Score: ${score}`, cx, cy - 20);
      ctx.fillText(`Best:  ${best}`,  cx, cy + 25);

      ctx.font      = '22px sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText('Tap or press Space to play again 🦤', cx, cy + 90);
    }
  }

  function drawPipe(p) {
    const capH   = 24;
    const capOvr = 6; // cap overhangs pipe body on each side

    // ── Top pipe ──
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapTop - capH);

    ctx.fillStyle = '#388E3C';
    ctx.fillRect(p.x - capOvr, p.gapTop - capH, PIPE_WIDTH + capOvr * 2, capH);

    // Highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(p.x + 6, 0, 10, p.gapTop - capH);

    // ── Bottom pipe ──
    const bTop = p.gapTop + PIPE_GAP;

    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(p.x, bTop + capH, PIPE_WIDTH, H - bTop - capH);

    ctx.fillStyle = '#388E3C';
    ctx.fillRect(p.x - capOvr, bTop, PIPE_WIDTH + capOvr * 2, capH);

    // Highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(p.x + 6, bTop + capH, 10, H - bTop - capH);
  }

  // ─── Game loop ─────────────────────────────────────────────────────────────
  function loop() {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
  }

  // ─── Resize: keep canvas full-screen ───────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    W = canvas.width;
    H = canvas.height;
  }

  // ─── Mount ─────────────────────────────────────────────────────────────────
  onMount(() => {
    ctx = canvas.getContext('2d');

    // Pre-render dodo emoji onto a small offscreen canvas once
    birdCanvas = document.createElement('canvas');
    birdCanvas.width  = BIRD_SIZE * 2;
    birdCanvas.height = BIRD_SIZE * 2;
    birdCtx = birdCanvas.getContext('2d');
    birdCtx.font         = `${BIRD_SIZE}px serif`;
    birdCtx.textAlign    = 'center';
    birdCtx.textBaseline = 'middle';
    birdCtx.fillText('🦤', BIRD_SIZE, BIRD_SIZE);

    resize();
    init();
    loop();

    window.addEventListener('resize', () => { resize(); if (gameState === 'dead') draw(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); flap(); }
    });
  });

  onDestroy(() => cancelAnimationFrame(animationId));
</script>

<!-- touch-action: none → prevents browser swallowing pointer events on mobile -->
<canvas bind:this={canvas} on:pointerdown={flap}></canvas>

<style>
  canvas {
    display: block;
    touch-action: none;
    cursor: pointer;
  }
</style>
