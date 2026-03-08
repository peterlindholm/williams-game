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
  const GRAVITY         = 0.5;
  const FLAP_POWER      = -10;
  const BIRD_SIZE       = 44;
  const PIPE_WIDTH      = 70;
  const PIPE_GAP_START  = 260;
  const PIPE_GAP_MIN    = 130;
  const PIPE_GAP_SHRINK = 6;
  const PIPE_SPEED      = 3;
  const PIPE_INTERVAL   = 95;

  function gapForScore(s) {
    return Math.max(PIPE_GAP_MIN, PIPE_GAP_START - s * PIPE_GAP_SHRINK);
  }

  // ─── Emoji picker ──────────────────────────────────────────────────────────
  const EMOJI_OPTIONS = [
    '🦤','🐦','🐧','🦅','🦆','🦜',
    '🐸','🐉','🦄','🐱','🐶','🚀',
  ];

  // Per-emoji overrides: some need a pre-rotation and/or no horizontal flip
  const EMOJI_CONFIG = {
    '🚀': { rotate: -Math.PI / 4, flip: false }, // rotate 45° CCW → points up-right; no flip
  };

  let selectedEmoji  = '🦤';
  let shouldFlipBird = true;
  let emojiButtons   = [];

  // Re-render the offscreen bird canvas whenever the emoji changes
  function renderBirdCanvas() {
    const config   = EMOJI_CONFIG[selectedEmoji];
    shouldFlipBird = config ? config.flip : true;

    birdCtx.clearRect(0, 0, BIRD_SIZE * 2, BIRD_SIZE * 2);
    birdCtx.save();
    birdCtx.translate(BIRD_SIZE, BIRD_SIZE);
    if (config?.rotate) birdCtx.rotate(config.rotate);
    birdCtx.font         = `${BIRD_SIZE}px serif`;
    birdCtx.textAlign    = 'center';
    birdCtx.textBaseline = 'middle';
    birdCtx.fillText(selectedEmoji, 0, 0);
    birdCtx.restore();
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let gameState = 'start';
  let score     = 0;
  let best      = 0;
  let frame     = 0;

  // ─── Bird ──────────────────────────────────────────────────────────────────
  let bird = { x: 0, y: 0, vy: 0 };

  // ─── Pipes ─────────────────────────────────────────────────────────────────
  let pipes     = [];
  let pipeCount = 0;

  // ─── Start / restart ───────────────────────────────────────────────────────
  function init() {
    W = canvas.width;
    H = canvas.height;
    bird      = { x: W * 0.25, y: H * 0.42, vy: 0 };
    pipes     = [];
    pipeCount = 0;
    frame     = 0;
    score     = 0;
    gameState = 'start';
  }

  // ─── Pointer handler — hit-test emoji buttons on start screen ─────────────
  function handlePointer(e) {
    if (gameState === 'start') {
      // Convert pointer coords to canvas coords
      const rect = canvas.getBoundingClientRect();
      const px   = (e.clientX - rect.left) * (W / rect.width);
      const py   = (e.clientY - rect.top)  * (H / rect.height);

      // Check if we hit an emoji button
      for (const btn of emojiButtons) {
        if (Math.hypot(px - btn.x, py - btn.y) < btn.r) {
          selectedEmoji = btn.emoji;
          renderBirdCanvas();
          return; // select emoji, don't start yet
        }
      }

      // Didn't hit a button → start game
      gameState = 'playing';
      bird.vy   = FLAP_POWER;
      return;
    }

    if (gameState === 'dead') { init(); return; }
    bird.vy = FLAP_POWER;
  }

  // ─── Spawn pipe ────────────────────────────────────────────────────────────
  function spawnPipe() {
    const gap    = gapForScore(score);
    const minTop = H * 0.12;
    const maxTop = H * 0.72 - gap;
    const gapTop = minTop + Math.random() * (maxTop - minTop);
    pipes.push({ x: W, gapTop, gap, scored: false, index: pipeCount++ });
  }

  // ─── Collision ─────────────────────────────────────────────────────────────
  function hits(p) {
    const m  = 6;
    const bl = bird.x - BIRD_SIZE / 2 + m;
    const br = bird.x + BIRD_SIZE / 2 - m;
    const bt = bird.y - BIRD_SIZE / 2 + m;
    const bb = bird.y + BIRD_SIZE / 2 - m;
    if (br < p.x || bl > p.x + PIPE_WIDTH) return false;
    return bt < p.gapTop || bb > p.gapTop + p.gap;
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  function update() {
    frame++;

    if (gameState === 'start') {
      bird.y = H * 0.42 + Math.sin(frame * 0.06) * 14;
      return;
    }

    if (gameState !== 'playing') return;

    bird.vy += GRAVITY;
    bird.y  += bird.vy;

    if (bird.y - BIRD_SIZE / 2 < 0) { bird.y = BIRD_SIZE / 2; bird.vy = 0; }
    if (bird.y + BIRD_SIZE / 2 >= H - 25) { gameOver(); return; }

    if (frame % PIPE_INTERVAL === 0) spawnPipe();

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED;
      if (!p.scored && p.x + PIPE_WIDTH < bird.x) { p.scored = true; score++; }
      if (p.x + PIPE_WIDTH < 0) { pipes.splice(i, 1); continue; }
      if (hits(p)) { gameOver(); return; }
    }
  }

  function gameOver() {
    gameState = 'dead';
    if (score > best) best = score;
  }

  // ─── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5BC8F5');
    sky.addColorStop(1, '#C9EEFF');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawSun();

    // Ground
    ctx.fillStyle = '#6DBE45';
    ctx.fillRect(0, H - 25, W, 25);
    ctx.fillStyle = '#4A8F2F';
    ctx.fillRect(0, H - 8, W, 8);

    pipes.forEach(drawPipe);

    // Bird
    ctx.save();
    const tilt = Math.max(-0.4, Math.min(bird.vy * 0.055, 0.6));
    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt);
    if (shouldFlipBird) ctx.scale(-1, 1); // flip birds to face right; skip for pre-rotated emojis
    ctx.drawImage(birdCanvas, -BIRD_SIZE, -BIRD_SIZE, BIRD_SIZE * 2, BIRD_SIZE * 2);
    ctx.restore();

    // Score
    if (gameState !== 'start') drawScore();

    // Overlays
    if (gameState === 'start') drawStartScreen();
    if (gameState === 'dead')  drawGameOver();
  }

  // ─── Score display ─────────────────────────────────────────────────────────
  function drawScore() {
    const digitColors = {
      '0':'#9E9E9E','1':'#E53935','2':'#FDD835','3':'#1E88E5',
      '4':'#8E24AA','5':'#43A047','6':'#29B6F6','7':'#FB8C00',
      '8':'#6D4C41','9':'#F5F5F5',
    };
    const digits = String(score).split('');
    ctx.font         = '28px "Press Start 2P"';
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    const cw     = ctx.measureText('0').width;
    const totalW = digits.length * cw + (digits.length - 1) * 4;
    let   x      = W / 2 - totalW / 2;
    digits.forEach(digit => {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 5;
      ctx.strokeText(digit, x, 18);
      ctx.fillStyle = digitColors[digit];
      ctx.fillText(digit, x, 18);
      x += cw + 4;
    });
  }

  // ─── Start screen ──────────────────────────────────────────────────────────
  function drawStartScreen() {
    const cx = W / 2;

    // Title panel
    const panelW = Math.min(480, W * 0.88);
    const panelH = 160;
    const panelX = cx - panelW / 2;
    const panelY = H * 0.10;

    ctx.fillStyle = 'rgba(0, 20, 60, 0.65)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 22);
    ctx.fill();

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#FFD700';
    ctx.font         = `bold ${Math.min(44, panelW * 0.115)}px sans-serif`;
    ctx.fillText("William's", cx, panelY + panelH * 0.30);
    ctx.font         = `bold ${Math.min(50, panelW * 0.13)}px sans-serif`;
    ctx.fillStyle    = 'white';
    ctx.fillText('Flying Game', cx, panelY + panelH * 0.68);

    // ── Emoji picker ──────────────────────────────────────────────────────────
    const pickerY    = H * 0.38;             // top of the picker area
    const btnR       = Math.min(38, W / 16); // hit radius per button
    const emojiSize  = btnR * 1.4;           // font size
    const cols       = 6;
    const colGap     = Math.min(btnR * 2.6, (W * 0.88) / cols);
    const totalGridW = colGap * (cols - 1);
    const startX     = cx - totalGridW / 2;

    // "Choose your character" label
    ctx.font         = '13px "Press Start 2P"';
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHOOSE CHARACTER', cx, pickerY - btnR * 1.1);

    // Clear and rebuild button hit areas each frame
    emojiButtons = [];

    EMOJI_OPTIONS.forEach((emoji, i) => {
      const col  = i % cols;
      const row  = Math.floor(i / cols);
      const bx   = startX + col * colGap;
      const by   = pickerY + row * (btnR * 2.5);

      emojiButtons.push({ x: bx, y: by, r: btnR, emoji });

      const isSelected = emoji === selectedEmoji;

      // Button background circle
      ctx.beginPath();
      ctx.arc(bx, by, btnR, 0, Math.PI * 2);
      ctx.fillStyle = isSelected
        ? 'rgba(255, 215, 0, 0.50)'   // gold highlight for selected
        : 'rgba(0, 20, 60, 0.45)';
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#FFD700' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Emoji (drawn directly — no flip, no transparency issue)
      ctx.font         = `${emojiSize}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, bx, by);
    });

    // Pulsing "tap to start" prompt (below the picker)
    const lastRow    = Math.floor((EMOJI_OPTIONS.length - 1) / cols);
    const promptY    = pickerY + lastRow * (btnR * 2.5) + btnR * 2.0;
    const pulse      = 0.6 + Math.sin(frame * 0.07) * 0.4;
    ctx.fillStyle    = `rgba(255, 255, 255, ${pulse})`;
    ctx.font         = '14px "Press Start 2P"';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAP ANYWHERE TO START', cx, promptY);
  }

  // ─── Game over screen ──────────────────────────────────────────────────────
  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#FFD700';
    ctx.font      = 'bold 26px sans-serif';
    ctx.fillText("William's Flying Game", cx, cy - 120);

    ctx.fillStyle = 'white';
    ctx.font      = '34px "Press Start 2P"';
    ctx.fillText('GAME OVER', cx, cy - 65);

    ctx.font = '15px "Press Start 2P"';
    ctx.fillText(`SCORE  ${score}`, cx, cy - 5);
    ctx.fillText(`BEST   ${best}`,  cx, cy + 30);

    ctx.font      = '11px "Press Start 2P"';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('TAP OR SPACE TO PLAY AGAIN', cx, cy + 90);
  }

  // ─── Sun ───────────────────────────────────────────────────────────────────
  function drawSun() {
    const sx = W * 0.80;
    const sy = H * 0.14;
    const r  = Math.min(W, H) * 0.075;

    ctx.save();

    const rayCount = 12;
    ctx.strokeStyle = '#FFC107';
    ctx.lineWidth   = Math.max(2, r * 0.08);
    ctx.lineCap     = 'round';
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * (r + 4),        sy + Math.sin(angle) * (r + 4));
      ctx.lineTo(sx + Math.cos(angle) * (r + r * 0.38), sy + Math.sin(angle) * (r + r * 0.38));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFE135';
    ctx.fill();

    const lw = r * 0.30, lh = r * 0.21;
    const gy = sy - r * 0.12;
    const lx = sx - r * 0.34, rx2 = sx + r * 0.34;
    const fw = Math.max(2, r * 0.07);

    ctx.strokeStyle = '#222';
    ctx.lineWidth   = fw;

    ctx.beginPath(); ctx.ellipse(lx,  gy, lw, lh, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(rx2, gy, lw, lh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(lx + lw, gy);
    ctx.quadraticCurveTo(sx, gy + lh * 0.5, rx2 - lw, gy);
    ctx.strokeStyle = '#222'; ctx.lineWidth = fw; ctx.stroke();

    ctx.lineWidth = fw;
    ctx.beginPath(); ctx.moveTo(lx  - lw, gy); ctx.lineTo(sx - r * 0.92, gy - r * 0.10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx2 + lw, gy); ctx.lineTo(sx + r * 0.92, gy - r * 0.10); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(lx  - lw*0.20, gy - lh*0.28, lw*0.28, lh*0.28, -0.4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rx2 - lw*0.20, gy - lh*0.28, lw*0.28, lh*0.28, -0.4, 0, Math.PI*2); ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy + r * 0.22, r * 0.32, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = '#c8860a';
    ctx.lineWidth   = Math.max(2, r * 0.09);
    ctx.lineCap     = 'round';
    ctx.stroke();

    ctx.restore();
  }

  // ─── Pipe ──────────────────────────────────────────────────────────────────
  function drawPipe(p) {
    const capH = 24, capOvr = 6;
    const colors = [
      { body: '#E53935', cap: '#B71C1C' },
      { body: '#FDD835', cap: '#F9A825' },
      { body: '#1E88E5', cap: '#1565C0' },
    ];
    const { body: cb, cap: cc } = colors[p.index % 3];
    const bTop = p.gapTop + p.gap;

    ctx.fillStyle = cb;
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapTop - capH);
    ctx.fillStyle = cc;
    ctx.fillRect(p.x - capOvr, p.gapTop - capH, PIPE_WIDTH + capOvr * 2, capH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(p.x + 6, 0, 10, p.gapTop - capH);

    ctx.fillStyle = cb;
    ctx.fillRect(p.x, bTop + capH, PIPE_WIDTH, H - bTop - capH);
    ctx.fillStyle = cc;
    ctx.fillRect(p.x - capOvr, bTop, PIPE_WIDTH + capOvr * 2, capH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(p.x + 6, bTop + capH, 10, H - bTop - capH);
  }

  // ─── Loop ──────────────────────────────────────────────────────────────────
  function loop() {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    W = canvas.width;
    H = canvas.height;
  }

  // ─── Mount ─────────────────────────────────────────────────────────────────
  onMount(async () => {
    ctx = canvas.getContext('2d');

    birdCanvas        = document.createElement('canvas');
    birdCanvas.width  = BIRD_SIZE * 2;
    birdCanvas.height = BIRD_SIZE * 2;
    birdCtx           = birdCanvas.getContext('2d');
    renderBirdCanvas();

    resize();
    init();

    await document.fonts.ready;
    loop();

    window.addEventListener('resize', () => { resize(); });
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); handlePointer({ clientX: 0, clientY: -999 }); }
    });
  });

  onDestroy(() => cancelAnimationFrame(animationId));
</script>

<canvas bind:this={canvas} on:pointerdown={handlePointer}></canvas>

<style>
  canvas {
    display: block;
    touch-action: none;
    cursor: pointer;
  }
</style>
