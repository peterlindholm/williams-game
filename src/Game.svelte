<script>
  import { onMount, onDestroy } from 'svelte';
  import { saveScore } from './lib/auth.js';

  // ─── Props from App ────────────────────────────────────────────────────────
  export let player          = null;  // { id, username }
  export let onLogout        = () => {};
  export let showLeaderboard = () => {};

  // ─── Canvas setup ─────────────────────────────────────────────────────────
  let canvas;
  let ctx;
  let animationId;
  let W, H;

  // Offscreen canvas for the bird emoji (avoids transparency bug with flipped fillText)
  let birdCanvas, birdCtx;

  // ─── Stars (pre-computed positions so they don't jitter each frame) ────────
  const STARS = Array.from({ length: 40 }, (_, i) => ({
    x:    ((i * 137.508) % 97 + 1.5) / 100,   // 0–1 relative to W
    y:    ((i * 83.127)  % 58 + 1.0) / 100,   // 0–1 relative to H (top 60%)
    r:    (i % 3 === 0) ? 2.0 : (i % 3 === 1) ? 1.3 : 0.9,
  }));

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
  const WATER_HEIGHT    = 65;    // How tall the water is at the bottom

  // How many points before the gap resets back to the start size
  const PIPE_GAP_CYCLE = Math.ceil((PIPE_GAP_START - PIPE_GAP_MIN) / PIPE_GAP_SHRINK); // ~22

  function gapForScore(s) {
    const cycleScore = s % PIPE_GAP_CYCLE; // reset every cycle
    return Math.max(PIPE_GAP_MIN, PIPE_GAP_START - cycleScore * PIPE_GAP_SHRINK);
  }

  // ─── Emoji picker ──────────────────────────────────────────────────────────
  const EMOJI_OPTIONS = [
    '🦤','🐦','🐧','🦅','🦆','🦜',
    '🐸','🐉','🦄','🐱','🐶','🚀',
  ];

  const EMOJI_NAMES = {
    '🦤':'Dodo',    '🐦':'Bird',   '🐧':'Penguin', '🦅':'Eagle',
    '🦆':'Duck',  '🦜':'Parrot', '🐸':'Frog',    '🐉':'Dragon',
    '🦄':'Unicorn', '🐱':'Cat',    '🐶':'Dog',      '🚀':'Rocket',
  };

  // Per-emoji overrides: some need a pre-rotation and/or no horizontal flip
  const EMOJI_CONFIG = {
    '🚀': { rotate: 0, flip: false }, // no rotation needed — glyph naturally points up-right
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

  // ─── Jumping fish (decorative — appear above water surface) ───────────────
  const FISH_EMOJIS = ['🐟','🐡','🐠'];
  let fishJumpers   = [];
  let nextFishScore = 5;  // spawn a fish every ~5 points

  function spawnFish() {
    fishJumpers.push({
      x:          W * (0.08 + Math.random() * 0.84),
      peakHeight: 120 + Math.random() * 100,  // jumps high!
      duration:   65 + Math.random() * 30,
      t:          0,
      emoji:      FISH_EMOJIS[Math.floor(Math.random() * FISH_EMOJIS.length)],
    });
    nextFishScore += 5;
  }

  function updateFish() {
    if (score >= nextFishScore) spawnFish();
    for (let i = fishJumpers.length - 1; i >= 0; i--) {
      fishJumpers[i].t += 1 / fishJumpers[i].duration;
      if (fishJumpers[i].t >= 1) fishJumpers.splice(i, 1);
    }
  }

  function drawFish() {
    const surfaceY = H - WATER_HEIGHT;
    for (const f of fishJumpers) {
      const y    = surfaceY - f.peakHeight * Math.sin(f.t * Math.PI);
      const tilt = Math.PI * 0.75 * (f.t - 0.5); // tilts nose-up → nose-down through arc
      ctx.save();
      ctx.translate(f.x, y);
      ctx.rotate(tilt);
      ctx.font         = '42px serif';   // bigger!
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji, 0, 0);
      ctx.restore();
    }
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let gameState  = 'start';
  let score      = 0;
  let best       = 0;
  let frame      = 0;
  let deathCause  = 'water';
  let deathFrame  = 0;
  let startFrame  = -1;    // frame when gameplay started (for frontflip animation)
  const FLIP_FRAMES = 32;  // how long the frontflip takes

  // ─── Bird ──────────────────────────────────────────────────────────────────
  let bird = { x: 0, y: 0, vy: 0 };

  // ─── Pipes ─────────────────────────────────────────────────────────────────
  let pipes     = [];
  let pipeCount = 0;

  // ─── Start / restart ───────────────────────────────────────────────────────
  function init() {
    W = canvas.width;
    H = canvas.height;
    bird          = { x: W * 0.25, y: H * 0.42, vy: 0 };
    pipes         = [];
    pipeCount     = 0;
    frame         = 0;
    score         = 0;
    startFrame    = -1;
    fishJumpers   = [];
    nextFishScore = 5;
    gameState     = 'start';
  }

  // ─── Pointer handler — hit-test emoji buttons on start screen ─────────────
  function handlePointer(e) {
    if (gameState === 'start') {
      const rect = canvas.getBoundingClientRect();
      const px   = (e.clientX - rect.left) * (W / rect.width);
      const py   = (e.clientY - rect.top)  * (H / rect.height);

      for (const btn of emojiButtons) {
        if (Math.hypot(px - btn.x, py - btn.y) < btn.r) {
          selectedEmoji = btn.emoji;
          renderBirdCanvas();
          return;
        }
      }

      // Start game + trigger frontflip
      gameState  = 'playing';
      startFrame = frame;
      bird.vy    = FLAP_POWER;
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

    if (bird.y - BIRD_SIZE / 2 < 0) { gameOver('ceiling'); return; }
    if (bird.y + BIRD_SIZE / 2 >= H) { gameOver('water'); return; }

    if (frame % PIPE_INTERVAL === 0) spawnPipe();

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED;
      if (!p.scored && p.x + PIPE_WIDTH < bird.x) { p.scored = true; score++; }
      if (p.x + PIPE_WIDTH < 0) { pipes.splice(i, 1); continue; }
      if (hits(p)) {
        // Cap hit = bird centre is inside the gap vertically (entered from top or bottom)
        // Side hit = bird centre is outside the gap (flew into the pipe wall)
        const capHit = bird.y >= p.gapTop && bird.y <= p.gapTop + p.gap;
        gameOver(capHit ? 'pipe-cap' : 'pipe');
        return;
      }
    }

    updateFish();
  }

  function gameOver(cause = 'water') {
    deathCause = cause;
    deathFrame = frame;
    gameState  = 'dead';
    if (score > best) best = score;
    // Save score to Supabase if logged in
    if (player && score > 0) {
      saveScore(player.id, player.username, score, selectedEmoji);
    }
  }

  // ─── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Day / night cycle — flips every 10 points
    const isNight = Math.floor(score / 10) % 2 === 1;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (isNight) {
      sky.addColorStop(0, '#06082a');
      sky.addColorStop(1, '#1a1a5a');
    } else {
      sky.addColorStop(0, '#5BC8F5');
      sky.addColorStop(1, '#C9EEFF');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (isNight) { drawStars(); drawMoon(); }
    else         { drawSun(); }

    // Bird drawn BEFORE pipes — so pipes appear on top, making it look
    // like the bird gets swallowed into the pipe on collision
    // (also drawn before water so water covers it when underwater)
    ctx.save();
    const tilt = Math.max(-0.4, Math.min(bird.vy * 0.055, 0.6));

    // Frontflip on game start — full 360° with ease-out
    let flipAngle = 0;
    if (startFrame >= 0 && gameState === 'playing') {
      const t = Math.min(1, (frame - startFrame) / FLIP_FRAMES);
      const eased = 1 - Math.pow(1 - t, 2.5); // ease-out: fast start, slow finish
      flipAngle = eased * Math.PI * 2;
    }

    ctx.translate(bird.x, bird.y);
    ctx.rotate(tilt + flipAngle);
    if (shouldFlipBird) ctx.scale(-1, 1);
    ctx.drawImage(birdCanvas, -BIRD_SIZE, -BIRD_SIZE, BIRD_SIZE * 2, BIRD_SIZE * 2);
    ctx.restore();

    // Pipes drawn AFTER bird — covers bird on collision (goes into pipe effect)
    pipes.forEach(drawPipe);

    // Water drawn LAST so it covers the emoji when it sinks below the surface
    const waveOffset = (frame * 0.3) % (Math.PI * 2);
    const waterGrad  = ctx.createLinearGradient(0, H - WATER_HEIGHT, 0, H);
    waterGrad.addColorStop(0, '#29B6F6');
    waterGrad.addColorStop(1, '#0277BD');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, H - WATER_HEIGHT, W, WATER_HEIGHT);

    // Animated wave on the surface
    ctx.beginPath();
    ctx.moveTo(0, H - WATER_HEIGHT);
    for (let wx = 0; wx <= W; wx += 4) {
      ctx.lineTo(wx, H - WATER_HEIGHT + Math.sin(wx * 0.04 + waveOffset) * 4);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();

    // Jumping fish — drawn on top of water surface
    drawFish();

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
    ctx.font         = '42px "Fredoka One"';
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
    ctx.fillText('Emoji', cx, panelY + panelH * 0.30);
    ctx.font         = `bold ${Math.min(50, panelW * 0.13)}px sans-serif`;
    ctx.fillStyle    = 'white';
    ctx.fillText('Jumpers', cx, panelY + panelH * 0.68);

    // ── Emoji picker ──────────────────────────────────────────────────────────
    const pickerY    = H * 0.38;             // top of the picker area
    const btnR       = Math.min(38, W / 16); // hit radius per button
    const emojiSize  = btnR * 1.4;           // font size
    const cols       = 6;
    const colGap     = Math.min(btnR * 2.6, (W * 0.88) / cols);
    const totalGridW = colGap * (cols - 1);
    const startX     = cx - totalGridW / 2;

    // Logged-in player name (top of start screen)
    if (player?.username) {
      ctx.font         = '16px "Fredoka One"';
      ctx.fillStyle    = 'rgba(255,215,0,0.9)';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`👤 ${player.username}`, 16, 16);
    }

    // "Choose your character" label
    ctx.font         = '18px "Fredoka One"';
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHOOSE CHARACTER', cx, pickerY - btnR * 1.8);

    // Clear and rebuild button hit areas each frame
    emojiButtons = [];

    EMOJI_OPTIONS.forEach((emoji, i) => {
      const col  = i % cols;
      const row  = Math.floor(i / cols);
      const bx   = startX + col * colGap;
      const by   = pickerY + row * (btnR * 3.2); // extra space for name labels

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

      // Name label above the button
      const labelSize = Math.max(8, btnR * 0.28);
      ctx.font         = `${labelSize}px sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle    = isSelected ? '#FFD700' : 'rgba(255,255,255,0.85)';
      ctx.fillText(EMOJI_NAMES[emoji] ?? emoji, bx, by - btnR - 2);
    });

    // Pulsing "tap to start" prompt (below the picker)
    const lastRow    = Math.floor((EMOJI_OPTIONS.length - 1) / cols);
    const promptY    = pickerY + lastRow * (btnR * 3.2) + btnR * 2.2;
    const pulse      = 0.6 + Math.sin(frame * 0.07) * 0.4;
    ctx.fillStyle    = `rgba(255, 255, 255, ${pulse})`;
    ctx.font         = '20px "Fredoka One"';
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
    ctx.fillText('Emoji Jumpers', cx, cy - 120);

    const isDrowned = deathCause === 'water';
    const isCapHit  = deathCause === 'pipe-cap';
    const fishers   = new Set(['🐧', '🦆']);
    const waterMsg  = fishers.has(selectedEmoji) ? 'NO FISH HERE' : 'YOU DROWNED';
    const deathText  = isCapHit  ? "YOU'RE NOT MARIO"
                     : isDrowned ? waterMsg
                     :             'GAME OVER';
    const deathColor = isCapHit  ? '#66BB6A'
                     : isDrowned ? '#29B6F6'
                     :             'white';

    // Death message only — no mushrooms
    ctx.fillStyle = deathColor;
    ctx.font      = '42px "Fredoka One"';
    ctx.fillText(deathText, cx, cy - 65);

    ctx.font = '24px "Fredoka One"';
    ctx.fillText(`SCORE  ${score}`, cx, cy - 5);
    ctx.fillText(`HIGHSCORE  ${best}`,  cx, cy + 30);

    ctx.font      = '16px "Fredoka One"';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('TAP OR SPACE TO PLAY AGAIN', cx, cy + 90);
  }

  // ─── Stars ─────────────────────────────────────────────────────────────────
  function drawStars() {
    ctx.save();
    STARS.forEach(s => {
      const twinkle = 0.5 + Math.sin(frame * 0.05 + s.x * 10) * 0.5;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 220, ${twinkle})`;
      ctx.fill();
    });
    ctx.restore();
  }

  // ─── Moon ──────────────────────────────────────────────────────────────────
  function drawMoon() {
    const mx = W * 0.80;
    // Gentle bob up and down
    const my = H * 0.14 + Math.sin(frame * 0.025) * 6;
    // Slow pulse
    const pulse = 1 + Math.sin(frame * 0.035) * 0.04;
    const r  = Math.min(W, H) * 0.075 * pulse;

    ctx.save();

    // Full moon circle
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF9C4';
    ctx.fill();

    // Cut a crescent by painting the sky colour over an offset circle
    ctx.beginPath();
    ctx.arc(mx - r * 0.38, my - r * 0.10, r * 0.82, 0, Math.PI * 2);
    ctx.fillStyle = '#06082a'; // matches night sky top colour
    ctx.fill();

    // Soft glow ring — pulses in size and brightness
    const glowSize = r * (1.5 + Math.sin(frame * 0.05) * 0.2);
    const glowAlpha = 0.15 + Math.sin(frame * 0.05) * 0.08;
    const glow = ctx.createRadialGradient(mx, my, r * 0.9, mx, my, glowSize);
    glow.addColorStop(0, `rgba(255,249,196,${glowAlpha})`);
    glow.addColorStop(1,  'rgba(255,249,196,0)');
    ctx.beginPath();
    ctx.arc(mx, my, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.restore();
  }

  // ─── Sun ───────────────────────────────────────────────────────────────────
  function drawSun() {
    const sx = W * 0.80;
    const sy = H * 0.14;

    // Breathing pulse
    const pulse = 1 + Math.sin(frame * 0.04) * 0.05;
    const r     = Math.min(W, H) * 0.075 * pulse;

    // Rays slowly rotate
    const rayRot = frame * 0.008;

    ctx.save();

    const rayCount = 12;
    ctx.strokeStyle = '#FFC107';
    ctx.lineWidth   = Math.max(2, r * 0.08);
    ctx.lineCap     = 'round';
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + rayRot;
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

    // 👀 Wiggle eyes on both caps
    const cx   = p.x + PIPE_WIDTH / 2;
    const eyeR = capH * 0.38;
    const gap2 = eyeR * 1.1;
    const seed  = p.index * 1.7;
    const pxOff = Math.cos(frame * 0.12 + seed) * eyeR * 0.38;
    const pyOff = Math.sin(frame * 0.09 + seed) * eyeR * 0.38;

    drawWiggleEyes(cx, p.gapTop - capH / 2, eyeR, gap2, pxOff, pyOff, p.index, true);  // top cap — ZZZ go up
    drawWiggleEyes(cx, bTop + capH / 2,     eyeR, gap2, pxOff, pyOff, p.index, false); // bottom cap — ZZZ go up too
  }

  function drawWiggleEyes(cx, cy, eyeR, gap, pxOff, pyOff, pipeIndex, zAbove) {
    // Compute isNight from score (same formula as draw())
    const night = Math.floor(score / 10) % 2 === 1;

    for (const ex of [cx - gap, cx + gap]) {
      // White eyeball
      ctx.beginPath();
      ctx.arc(ex, cy, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (night) {
        // Light blue shadow on lower half — looks like a droopy sleepy eye
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, cy, eyeR, 0, Math.PI);
        ctx.clip();
        ctx.fillStyle = 'rgba(180, 210, 240, 0.45)';
        ctx.fillRect(ex - eyeR, cy, eyeR * 2, eyeR);
        ctx.restore();

        // Eyelid curve across the middle
        ctx.beginPath();
        ctx.moveTo(ex - eyeR * 0.88, cy - eyeR * 0.05);
        ctx.quadraticCurveTo(ex, cy + eyeR * 0.42, ex + eyeR * 0.88, cy - eyeR * 0.05);
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth   = Math.max(2, eyeR * 0.28);
        ctx.lineCap     = 'round';
        ctx.stroke();

        // 3 lashes hanging down from the lid
        const lashes = [
          { rx: -0.52, ax: -0.45 },
          { rx:  0,    ax:  0    },
          { rx:  0.52, ax:  0.45 },
        ];
        for (const { rx, ax } of lashes) {
          const lx = ex + rx * eyeR * 0.82;
          const ly = cy + eyeR * (0.18 + (0.5 - Math.abs(rx)) * 0.4);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + Math.sin(ax) * eyeR * 0.38, ly + eyeR * 0.48);
          ctx.strokeStyle = '#2a2a2a';
          ctx.lineWidth   = Math.max(1.5, eyeR * 0.15);
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
      } else {
        // Wiggle pupil
        const pupilR = eyeR * 0.48;
        const px = Math.max(ex - eyeR + pupilR, Math.min(ex + eyeR - pupilR, ex + pxOff));
        const py = Math.max(cy - eyeR + pupilR, Math.min(cy + eyeR - pupilR, cy + pyOff));
        ctx.beginPath();
        ctx.arc(px, py, pupilR, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px - pupilR * 0.3, py - pupilR * 0.3, pupilR * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
      }
    }

    // 💤 Floating ZZZ at night
    if (night) {
      const dir = zAbove ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const phase    = ((frame * 0.008 + i * 0.33 + pipeIndex * 0.2) % 1);
        const zY       = cy + dir * (eyeR + 8 + phase * 36);
        const alpha    = Math.sin(phase * Math.PI);
        const size     = 9 + i * 3 + phase * 5;
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.font         = `bold ${size}px sans-serif`;
        ctx.fillStyle    = '#FFD700';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Z', cx + (i - 1) * 5 + phase * 8 * dir, zY);
        ctx.restore();
      }
    }
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

<div class="wrap">
  <canvas bind:this={canvas} on:pointerdown={handlePointer}></canvas>

  <!-- Leaderboard and sign out buttons hidden for now -->
</div>

<style>
  .wrap {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  canvas {
    display: block;
    touch-action: none;
    cursor: pointer;
  }

  .start-ui {
    position: absolute;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.75rem;
    pointer-events: all;
  }

  .lb-btn, .out-btn {
    padding: 0.6rem 1.2rem;
    border-radius: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    backdrop-filter: blur(4px);
  }

  .lb-btn {
    background: rgba(255,215,0,0.25);
    color: #FFD700;
    border-color: #FFD700;
  }
  .lb-btn:hover { background: rgba(255,215,0,0.45); }

  .out-btn {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.7);
  }
  .out-btn:hover { background: rgba(255,255,255,0.2); color: white; }
</style>
