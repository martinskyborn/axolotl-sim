(() => {
  const SUPABASE_URL = "https://uegujtsohwoyvnlcgesn.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlZ3VqdHNvaHdveXZubGNnZXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzg2NzEsImV4cCI6MjA5MjcxNDY3MX0.AWyV80l-k-pa4_XvqFCS7HupLU-sh69YCNUbI3AzDCY";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlay = document.getElementById("overlay");
  const startButton = document.getElementById("startButton");
  const pauseButton = document.getElementById("pauseButton");
  const nameEntry = document.getElementById("nameEntry");
  const nameInput = document.getElementById("nameInput");
  const saveButton = document.getElementById("saveButton");
  const leaderboardEl = document.getElementById("leaderboardEl");
  const leaderboardButton = document.getElementById("leaderboardButton");
  const bottomBar = document.getElementById("bottomBar");
  const barPauseBtn = document.getElementById("barPauseBtn");
  const barSoundBtn = document.getElementById("barSoundBtn");
  const barSettingsBtn = document.getElementById("barSettingsBtn");
  const barScore = document.getElementById("barScore");
  const barLives = document.getElementById("barLives");
  const soundWave1 = document.getElementById("soundWave1");
  const soundWave2 = document.getElementById("soundWave2");
  const settingsPanel = document.getElementById("settingsPanel");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeVal = document.getElementById("volumeVal");
  const childModeToggle = document.getElementById("childModeToggle");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");
  const settingsOverlayBtn = document.getElementById("settingsOverlayBtn");

  const ASSETS = {
    background: "assets/generated/background.png",
    axolotl: "assets/processed/axolotl-sheet.png",
    kelp: "assets/processed/kelp-sheet.png",
    star: "assets/processed/star-sheet.png"
  };

  const images = {};
  const settings = {
    volume: 0.7,
    musicMuted: false,
    childMode: false
  };

  const state = {
    mode: "loading",
    width: 390,
    height: 844,
    barHeight: 0,
    dpr: 1,
    lastTime: 0,
    elapsed: 0,
    score: 0,
    lives: 3,
    best: Number(localStorage.getItem("axolotl-best") || 0),
    obstacles: [],
    stars: [],
    bubbles: [],
    ripples: [],
    spawnTimer: 0,
    starTimer: 0,
    flash: 0,
    invincible: 0,
    mutedUntilGesture: true
  };

  const player = {
    x: 92,
    y: 390,
    vy: 0,
    radius: 27,
    frame: 0,
    frameTimer: 0,
    tilt: 0
  };

  let audioContext;
  let musicGain;
  let musicSource;
  const music = new Audio("assets/axolotl-seaweed-drift.mp3");
  music.loop = true;
  music.preload = "auto";
  music.crossOrigin = "anonymous";

  function loadImage(key, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        images[key] = img;
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  const sbHeaders = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json",
  };

  async function fetchScores() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?order=score.desc&limit=5`, { headers: sbHeaders });
      return res.ok ? res.json() : [];
    } catch { return []; }
  }

  async function saveScore(name, score) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ name, score }),
      });
    } catch { /* silent fail */ }
  }

  async function renderLeaderboard(highlightName = null, highlightScore = null) {
    leaderboardEl.innerHTML = "<li><span>Laddar…</span><span></span></li>";
    const scores = await fetchScores();
    const hi = highlightName !== null
      ? scores.findIndex(s => s.name === highlightName && s.score === highlightScore)
      : -1;
    leaderboardEl.innerHTML = scores.length
      ? scores.map((s, i) =>
          `<li class="${i === hi ? "is-new" : ""}"><span>#${i + 1} ${s.name}</span><span>${s.score}</span></li>`
        ).join("")
      : "<li><span>Inga poäng ännu</span><span></span></li>";
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(560, Math.round(rect.height));
    state.dpr = 1;
    state.width = width;
    state.height = height;
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    player.x = Math.max(78, width * 0.23);
    updateBarHeight();
  }

  function setOverlay(title, text, button) {
    overlay.querySelector("h1").textContent = title;
    const pEl = overlay.querySelector("p");
    pEl.textContent = text;
    pEl.style.display = "";
    startButton.textContent = button;
    startButton.classList.remove("is-hidden");
    nameEntry.classList.add("is-hidden");
    leaderboardEl.classList.add("is-hidden");
    leaderboardButton.classList.add("is-hidden");
    settingsOverlayBtn.classList.add("is-hidden");
    overlay.classList.add("is-visible");
    pauseButton.classList.add("is-hidden");
    updateBarHeight();
  }

  function hideOverlay() {
    overlay.classList.remove("is-visible");
    updateBarHeight();
  }

  function unlockAudio() {
    if (audioContext) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext = new Ctx();
    state.mutedUntilGesture = false;
    try {
      musicSource = audioContext.createMediaElementSource(music);
      musicGain = audioContext.createGain();
      musicGain.gain.value = settings.musicMuted ? 0 : settings.volume;
      musicSource.connect(musicGain);
      musicGain.connect(audioContext.destination);
    } catch { /* already connected or not supported */ }
    startMusic();
  }

  function sound(type) {
    if (!audioContext || audioContext.state === "suspended") return;
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const osc = audioContext.createOscillator();
    gain.connect(audioContext.destination);
    osc.connect(gain);

    if (type === "swim") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.11);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.14);
    }

    if (type === "star") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(1050, now + 0.16);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.24);
    }

    if (type === "bump") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.085, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  // ── Background music (MP3) ────────────────────────────────
  function startMusic() {
    if (musicGain) {
      musicGain.gain.value = settings.musicMuted ? 0 : settings.volume;
    } else {
      // fallback before audio is unlocked / on browsers that allow direct volume
      music.volume = settings.musicMuted ? 0 : settings.volume;
    }
    music.play().catch(() => { /* autoplay blocked, will retry on next gesture */ });
  }

  function stopMusic() {
    music.pause();
  }

  function updateMusicVolume() {
    const v = settings.musicMuted ? 0 : settings.volume;
    if (musicGain) musicGain.gain.value = v;
    else music.volume = v;
  }

  function updateSoundIcon() {
    const muted = settings.musicMuted;
    soundWave1.setAttribute("opacity", muted ? "0.2" : "1");
    soundWave2.setAttribute("opacity", muted ? "0.1" : "0.6");
  }

  function updateBarHeight() {
    bottomBar.classList.remove("is-hidden");
    state.barHeight = bottomBar.offsetHeight;
  }

  function resetGame() {
    state.mode = "playing";
    state.elapsed = 0;
    state.score = 0;
    state.lives = 3;
    state.obstacles = [];
    state.stars = [];
    state.bubbles = [];
    state.ripples = [];
    state.spawnTimer = 0.7;
    state.starTimer = 1.2;
    state.flash = 0;
    state.invincible = 0;
    player.y = state.height * 0.48;
    player.vy = -80;
    player.frame = 0;
    player.frameTimer = 0;
    hideOverlay();
  }

  function startOrResume() {
    unlockAudio();
    if (audioContext?.state === "suspended") { audioContext.resume(); startMusic(); }
    if (state.mode === "loading") return;
    if (state.mode === "leaderboard") {
      state.mode = "ready";
      setOverlay("Axolotl Sim", "Tryck för att simma uppåt. Samla stjärnor och undvik tången.", "Starta");
      leaderboardButton.classList.remove("is-hidden");
      settingsOverlayBtn.classList.remove("is-hidden");
      return;
    }
    if (state.mode === "paused") {
      state.mode = "playing";
      hideOverlay();
      state.lastTime = performance.now();
      requestAnimationFrame(loop);
      return;
    }
    resetGame();
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    state.mode = "paused";
    setOverlay("Paus", `Poäng: ${state.score}`, "Fortsätt");
    settingsOverlayBtn.classList.remove("is-hidden");
  }

  function flap() {
    if (state.mode !== "playing") return;
    unlockAudio();
    if (audioContext?.state === "suspended") audioContext.resume();
    player.vy = -330;
    player.frame = (player.frame + 1) % 4;
    state.ripples.push({ x: player.x - 32, y: player.y + 12, age: 0, life: 0.45 });
    sound("swim");
  }

  function difficulty() {
    const level = Math.min(1, state.elapsed / 75);
    const child = settings.childMode;
    return {
      speed:    (child ? 0.72 : 1) * (136 + level * 112 + Math.min(48, state.score * 2.1)),
      gap:      child
                  ? Math.max(220, 320 - level * 55 - Math.min(20, state.score * 0.5))
                  : Math.max(164, 250 - level * 68 - Math.min(28, state.score * 0.8)),
      interval: Math.max(child ? 1.4 : 1.05, (child ? 2.1 : 1.72) - level * 0.42)
    };
  }

  function spawnObstacle() {
    const d = difficulty();
    const marginTop = Math.max(state.barHeight + 80, state.height * 0.15);
    const marginBottom = Math.max(122, state.height * 0.16);
    const centerMin = marginTop + d.gap / 2;
    const centerMax = state.height - marginBottom - d.gap / 2;
    const center = centerMin + Math.random() * Math.max(20, centerMax - centerMin);
    const width = Math.min(112, Math.max(82, state.width * 0.24));
    state.obstacles.push({
      x: state.width + width,
      width,
      gapTop: center - d.gap / 2,
      gapBottom: center + d.gap / 2,
      frame: Math.floor(Math.random() * 3),
      passed: false,
      sway: Math.random() * Math.PI * 2
    });
  }

  function spawnStar() {
    const d = difficulty();
    const x = state.width + 84;
    const yMin = state.barHeight + 80;
    const yMax = state.height - 145;
    const y = yMin + Math.random() * Math.max(40, yMax - yMin);
    state.stars.push({
      x,
      y,
      size: Math.min(58, Math.max(44, state.width * 0.13)),
      frame: Math.floor(Math.random() * 4),
      spin: Math.random() * Math.PI * 2,
      vx: d.speed * 0.86
    });
  }

  function addAmbientBubble() {
    state.bubbles.push({
      x: Math.random() * state.width,
      y: state.height + 20,
      r: 4 + Math.random() * 12,
      vy: 22 + Math.random() * 42,
      wobble: Math.random() * Math.PI * 2,
      alpha: 0.34 + Math.random() * 0.34
    });
  }

  function hitPlayer() {
    if (state.invincible > 0) return;
    state.lives -= 1;
    state.invincible = 1.55;
    state.flash = 0.22;
    player.vy = -215;
    sound("bump");
    if (navigator.vibrate) navigator.vibrate(60);
    if (state.lives <= 0) gameOver();
  }

  async function gameOver() {
    state.mode = "over";
    state.best = Math.max(state.best, state.score);
    localStorage.setItem("axolotl-best", String(state.best));

    overlay.querySelector("h1").textContent = "Bra jobbat!";
    const pEl = overlay.querySelector("p");
    pEl.textContent = `Poäng: ${state.score}  |  Bästa: ${state.best}`;
    pEl.style.display = "";
    startButton.classList.add("is-hidden");
    leaderboardButton.classList.add("is-hidden");
    nameEntry.classList.add("is-hidden");
    leaderboardEl.classList.add("is-hidden");
    overlay.classList.add("is-visible");
    pauseButton.classList.add("is-hidden");
    updateBarHeight();

    const scores = await fetchScores();
    const qualifies = scores.length < 5 || state.score > scores[scores.length - 1].score;

    if (qualifies) {
      nameInput.value = "";
      nameEntry.classList.remove("is-hidden");
      setTimeout(() => nameInput.focus(), 80);
    } else {
      startButton.textContent = "Spela igen";
      startButton.classList.remove("is-hidden");
      leaderboardButton.classList.remove("is-hidden");
    }
  }

  function circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
    const px = Math.max(rx, Math.min(cx, rx + rw));
    const py = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - px;
    const dy = cy - py;
    return dx * dx + dy * dy < radius * radius;
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    const d = difficulty();
    state.elapsed += dt;
    state.spawnTimer -= dt;
    state.starTimer -= dt;
    state.flash = Math.max(0, state.flash - dt);
    state.invincible = Math.max(0, state.invincible - dt);

    player.vy = Math.min(330, player.vy + 535 * dt);
    player.y += player.vy * dt;
    player.tilt += (((player.vy + 80) / 500) - player.tilt) * Math.min(1, dt * 7);
    player.frameTimer += dt;
    if (player.frameTimer > 0.105) {
      player.frameTimer = 0;
      player.frame = (player.frame + 1) % 4;
    }

    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = d.interval + Math.random() * 0.24;
    }
    if (state.starTimer <= 0) {
      spawnStar();
      state.starTimer = 2.05 + Math.random() * 1.1;
    }
    if (Math.random() < dt * 2.2) addAmbientBubble();

    for (const obstacle of state.obstacles) {
      obstacle.x -= d.speed * dt;
      obstacle.sway += dt * 1.4;
      if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
        obstacle.passed = true;
        state.score += 1;
      }
      const pad = Math.max(12, obstacle.width * 0.18);
      const hitTop = circleRectCollision(player.x, player.y, player.radius * 0.82, obstacle.x + pad, -20, obstacle.width - pad * 2, obstacle.gapTop + 34);
      const hitBottom = circleRectCollision(player.x, player.y, player.radius * 0.82, obstacle.x + pad, obstacle.gapBottom - 34, obstacle.width - pad * 2, state.height - obstacle.gapBottom + 80);
      if (hitTop || hitBottom) hitPlayer();
    }

    for (const star of state.stars) {
      star.x -= star.vx * dt;
      star.spin += dt * 2.4;
      const dx = player.x - star.x;
      const dy = player.y - star.y;
      if (dx * dx + dy * dy < (player.radius + star.size * 0.34) ** 2) {
        star.collected = true;
        state.score += 2;
        state.ripples.push({ x: star.x, y: star.y, age: 0, life: 0.35, gold: true });
        sound("star");
      }
    }

    for (const bubble of state.bubbles) {
      bubble.y -= bubble.vy * dt;
      bubble.x += Math.sin(state.elapsed * 2 + bubble.wobble) * dt * 13;
    }
    for (const ripple of state.ripples) ripple.age += dt;

    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -80);
    state.stars = state.stars.filter((star) => !star.collected && star.x > -80);
    state.bubbles = state.bubbles.filter((bubble) => bubble.y + bubble.r > -20);
    state.ripples = state.ripples.filter((ripple) => ripple.age < ripple.life);

    const ceilY = state.barHeight + 36;
    const floorY = state.height - 66;
    if (player.y < ceilY) {
      player.y = ceilY;
      player.vy = 60;
    }
    if (player.y > floorY - 12) hitPlayer();
    if (player.y > floorY) {
      player.y = floorY;
      player.vy = -180;
    }
  }

  function drawBackground() {
    const bg = images.background;
    ctx.drawImage(bg, 0, 0, state.width, state.height);
  }

  function drawBubble(x, y, r, alpha = 0.55) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.36, "rgba(159,239,255,0.44)");
    g.addColorStop(0.74, "rgba(80,195,238,0.2)");
    g.addColorStop(1, "rgba(255,255,255,0.72)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x - r * 0.33, y - r * 0.36, r * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawKelp(obstacle) {
    const img = images.kelp;
    const frameW = img.width / 3;
    const frameH = img.height;
    const sx = obstacle.frame * frameW;
    const sway = Math.sin(obstacle.sway) * 5;
    const topHeight = obstacle.gapTop + 74;
    const bottomHeight = state.height - obstacle.gapBottom + 96;

    ctx.save();
    ctx.translate(obstacle.x + obstacle.width / 2 + sway, obstacle.gapTop + 38);
    ctx.scale(1, -1);
    ctx.drawImage(img, sx, 0, frameW, frameH, -obstacle.width / 2, 0, obstacle.width, topHeight);
    ctx.restore();

    ctx.save();
    ctx.translate(obstacle.x + obstacle.width / 2 - sway * 0.4, obstacle.gapBottom - 38);
    ctx.drawImage(img, sx, 0, frameW, frameH, -obstacle.width / 2, 0, obstacle.width, bottomHeight);
    ctx.restore();
  }

  function drawStar(star) {
    const img = images.star;
    const frameW = img.width / 4;
    const frameH = img.height;
    const pulse = 1 + Math.sin(state.elapsed * 5 + star.spin) * 0.07;
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(Math.sin(star.spin) * 0.08);
    ctx.drawImage(
      img,
      star.frame * frameW,
      0,
      frameW,
      frameH,
      (-star.size * pulse) / 2,
      (-star.size * pulse) / 2,
      star.size * pulse,
      star.size * pulse
    );
    ctx.restore();
  }

  function drawPlayer() {
    const img = images.axolotl;
    const frameW = img.width / 4;
    const frameH = img.height;
    const drawW = Math.min(124, Math.max(94, state.width * 0.29));
    const drawH = drawW * (frameH / frameW);
    const blink = state.invincible > 0 && Math.floor(state.invincible * 12) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.42;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.max(-0.45, Math.min(0.45, player.tilt)));
    ctx.drawImage(
      img,
      player.frame * frameW,
      0,
      frameW,
      frameH,
      -drawW * 0.48,
      -drawH * 0.5,
      drawW,
      drawH
    );
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 42, size / 42);
    const g = ctx.createLinearGradient(0, -20, 0, 22);
    g.addColorStop(0, "#ff73ad");
    g.addColorStop(0.55, "#ff2f86");
    g.addColorStop(1, "#d71768");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(255,255,255,0.86)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.bezierCurveTo(-30, -4, -17, -26, 0, -10);
    ctx.bezierCurveTo(17, -26, 30, -4, 0, 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function strokeText(text, x, y, size, align = "center") {
    ctx.font = `900 ${size}px "Trebuchet MS", "Arial Rounded MT Bold", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#164f88";
    ctx.lineWidth = Math.max(5, size * 0.13);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  }

  function drawHud() {
    // Update bottom bar DOM elements
    barScore.textContent = state.score;
    barLives.textContent = state.lives;
  }

  function drawRipples() {
    for (const ripple of state.ripples) {
      const t = ripple.age / ripple.life;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = ripple.gold ? "rgba(255,236,99,0.9)" : "rgba(255,255,255,0.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, 10 + t * 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground();

    for (const bubble of state.bubbles) drawBubble(bubble.x, bubble.y, bubble.r, bubble.alpha);
    drawRipples();
    for (const star of state.stars) drawStar(star);
    for (const obstacle of state.obstacles) drawKelp(obstacle);
    drawPlayer();
    drawHud();

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 1.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, state.width, state.height);
      ctx.restore();
    }
  }

  function loop(time) {
    const dt = Math.min(0.034, Math.max(0, (time - state.lastTime) / 1000 || 0));
    state.lastTime = time;
    update(dt);
    render();
    if (state.mode === "playing") requestAnimationFrame(loop);
  }

  function applySeabedBlend() {
    const bg = images.background;
    if (!bg) return;
    try {
      const c = document.createElement("canvas");
      c.width = bg.width;
      c.height = 1;
      const cx = c.getContext("2d");
      cx.drawImage(bg, 0, bg.height - 1, bg.width, 1, 0, 0, bg.width, 1);
      const data = cx.getImageData(0, 0, bg.width, 1).data;
      let r = 0, g = 0, b = 0;
      const step = Math.max(1, Math.floor(bg.width / 32));
      let n = 0;
      for (let i = 0; i < bg.width; i += step) {
        const k = i * 4;
        r += data[k]; g += data[k + 1]; b += data[k + 2];
        n += 1;
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const col = `rgb(${r},${g},${b})`;
      document.body.style.background = col;
      const app = document.getElementById("app");
      if (app) app.style.background = col;
    } catch { /* CORS or other; ignore */ }
  }

  async function boot() {
    resize();
    setTimeout(() => { resize(); render(); }, 200);
    setOverlay("Laddar", "Snart kan axolotlen simma.", "Vänta");
    await Promise.all(Object.entries(ASSETS).map(([key, src]) => loadImage(key, src)));
    state.mode = "ready";
    applySeabedBlend();
    for (let i = 0; i < 14; i += 1) addAmbientBubble();
    render();
    setOverlay("Axolotl Sim", "Tryck för att simma uppåt. Samla stjärnor och undvik tången.", "Starta");
    leaderboardButton.classList.remove("is-hidden");
    settingsOverlayBtn.classList.remove("is-hidden");
    updateSoundIcon();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  window.addEventListener("resize", () => { resize(); render(); });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      if (state.mode === "playing") flap();
      else startOrResume();
    }
    if (event.code === "Escape") pauseGame();
  });
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    flap();
  });
  startButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startOrResume();
  });
  pauseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    pauseGame();
  });
  saveButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const name = nameInput.value.trim() || "Anonym";
    saveButton.disabled = true;
    saveButton.textContent = "…";
    await saveScore(name, state.score);
    nameEntry.classList.add("is-hidden");
    overlay.querySelector("p").style.display = "none";
    leaderboardEl.classList.remove("is-hidden");
    await renderLeaderboard(name, state.score);
    startButton.textContent = "Spela igen";
    startButton.classList.remove("is-hidden");
    saveButton.disabled = false;
    saveButton.textContent = "Spara";
  });
  nameInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") saveButton.click();
  });
  leaderboardButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    state.mode = "leaderboard";
    overlay.querySelector("h1").textContent = "Topplista";
    overlay.querySelector("p").style.display = "none";
    nameEntry.classList.add("is-hidden");
    leaderboardEl.classList.remove("is-hidden");
    startButton.textContent = "Tillbaka";
    startButton.classList.remove("is-hidden");
    leaderboardButton.classList.add("is-hidden");
    await renderLeaderboard();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  // Bottom bar buttons
  barPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.mode === "playing") pauseGame();
    else if (state.mode === "paused") startOrResume();
  });

  barSoundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.musicMuted = !settings.musicMuted;
    updateMusicVolume();
    updateSoundIcon();
  });

  barSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.mode === "playing") pauseGame();
    settingsPanel.classList.remove("is-hidden");
  });

  settingsCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.add("is-hidden");
  });

  settingsOverlayBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.remove("is-hidden");
  });

  volumeSlider.addEventListener("input", () => {
    settings.volume = volumeSlider.value / 100;
    volumeVal.textContent = volumeSlider.value + "%";
    updateMusicVolume();
  });

  childModeToggle.addEventListener("change", () => {
    settings.childMode = childModeToggle.checked;
  });

  boot().catch(() => {
    state.mode = "error";
    setOverlay("Oj då", "Spelet kunde inte ladda bilderna.", "Försök igen");
  });
})();
