/* ==========================================================================
   TAP TO PUMP — THE BLACK BULL REVOLUTION
   Vanilla JS, ES6 classes. No external libraries.
   ========================================================================== */

(() => {
  'use strict';

  // ------------------------------------------------------------------------
  // CONSTANTS
  // ------------------------------------------------------------------------
  const GAME_DURATION = 30;          // seconds
  const BASE_TAP_VALUE = 100;        // $ANSEM per tap at x1
  const ENERGY_PER_TAP = 6;          // energy gained per tap (0-100 scale)
  const ENERGY_DECAY_PER_SEC = 14;   // energy drains if you stop tapping
  const BLACK_BULL_DURATION = 5;     // seconds
  const BLACK_BULL_MULTIPLIER = 5;
  const COMBO_RESET_MS = 900;        // ms of inactivity before combo resets
  const COMBO_TIERS = [
    { count: 5,  label: '🔥 ON FIRE',        mult: 2 },
    { count: 10, label: '⚡ BLACK BULL MODE', mult: 3 },
    { count: 20, label: '🚀 SEND IT',         mult: 4 },
    { count: 50, label: '🐂 REVOLUTION',      mult: 6 },
  ];
  const MILESTONE_STEP = 10000;      // celebrate every 10,000 $ANSEM
  const ACHIEVEMENTS = [10000, 50000, 100000, 250000, 500000];
  const LB_KEY = 'blackBullLeaderboard';
  const LB_MAX = 10;

  const FLOAT_ICONS = ['◎', '𝕏', '🐂', '◈'];

  // ------------------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const formatNumber = (n) => Math.round(n).toLocaleString('en-US');

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  // ------------------------------------------------------------------------
  // AUDIO MANAGER — plays sfx safely even if files are missing/blocked
  // ------------------------------------------------------------------------
  class AudioManager {
    constructor() {
      this.sfx = {
        tap: $('sfxTap'),
        combo: $('sfxCombo'),
        super: $('sfxSuper'),
        countdown: $('sfxCountdown'),
        gameover: $('sfxGameOver'),
        music: $('sfxMusic'),
      };
      this.muted = false;
      this.musicBaseRate = 1;
    }

    play(name, { volume = 0.6 } = {}) {
      if (this.muted) return;
      const el = this.sfx[name];
      if (!el) return;
      try {
        const node = el.cloneNode(true);
        node.volume = volume;
        node.play().catch(() => {});
      } catch (e) { /* file missing or blocked — safe no-op */ }
    }

    startMusic() {
      const el = this.sfx.music;
      if (!el) return;
      el.volume = 0.35;
      el.playbackRate = 1;
      el.play().catch(() => {});
    }

    setMusicSpeed(rate) {
      const el = this.sfx.music;
      if (!el) return;
      try { el.playbackRate = rate; } catch (e) {}
    }

    stopMusic() {
      const el = this.sfx.music;
      if (!el) return;
      try { el.pause(); el.currentTime = 0; } catch (e) {}
    }
  }

  // ------------------------------------------------------------------------
  // AMBIENT BACKGROUND PARTICLES (canvas) — drifting crypto dust
  // ------------------------------------------------------------------------
  class AmbientParticles {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.raf = null;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.seed();
      this.loop();
    }

    resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    seed() {
      const count = window.innerWidth < 600 ? 22 : 40;
      for (let i = 0; i < count; i++) {
        this.particles.push(this.makeParticle());
      }
    }

    makeParticle() {
      const colors = ['#a855f7', '#22d3ee', '#22ff88', '#fbbf24'];
      return {
        x: rand(0, this.canvas.width),
        y: rand(0, this.canvas.height),
        r: rand(1, 3),
        speed: rand(0.1, 0.4),
        drift: rand(-0.15, 0.15),
        color: colors[Math.floor(rand(0, colors.length))],
        alpha: rand(0.2, 0.6),
      };
    }

    loop() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const p of this.particles) {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -10) { p.y = this.canvas.height + 10; p.x = rand(0, this.canvas.width); }
        if (p.x < -10) p.x = this.canvas.width + 10;
        if (p.x > this.canvas.width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.raf = requestAnimationFrame(() => this.loop());
    }
  }

  // ------------------------------------------------------------------------
  // TAP EFFECTS — ripples, floating "+100" text, particle bursts
  // ------------------------------------------------------------------------
  class TapEffects {
    constructor({ rippleLayer, textLayer, particleLayer }) {
      this.rippleLayer = rippleLayer;
      this.textLayer = textLayer;
      this.particleLayer = particleLayer;
    }

    ripple(x, y) {
      const el = document.createElement('div');
      el.className = 'ripple';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      this.rippleLayer.appendChild(el);
      setTimeout(() => el.remove(), 550);
    }

    floatingText(x, y, text, { superCharged = false } = {}) {
      const el = document.createElement('div');
      el.className = 'float-text' + (superCharged ? ' super' : '');
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--dx', `${rand(-20, 20)}px`);
      this.textLayer.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }

    burst(x, y, { count = 10, colors = ['#a855f7', '#22d3ee', '#fbbf24'], power = 1 } = {}) {
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'particle';
        const size = rand(4, 9);
        const angle = rand(0, Math.PI * 2);
        const dist = rand(30, 90) * power;
        el.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
        el.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.background = colors[Math.floor(rand(0, colors.length))];
        el.style.boxShadow = `0 0 8px ${colors[Math.floor(rand(0, colors.length))]}`;
        this.particleLayer.appendChild(el);
        setTimeout(() => el.remove(), 750);
      }
    }
  }

  // ------------------------------------------------------------------------
  // LEADERBOARD — persisted via localStorage
  // ------------------------------------------------------------------------
  class Leaderboard {
    load() {
      try {
        const raw = localStorage.getItem(LB_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    save(entries) {
      try {
        localStorage.setItem(LB_KEY, JSON.stringify(entries));
      } catch (e) { /* storage unavailable — fail silently */ }
    }

    add({ name, score, combo }) {
      const entries = this.load();
      entries.push({ name, score, combo, date: new Date().toISOString() });
      entries.sort((a, b) => b.score - a.score);
      const top = entries.slice(0, LB_MAX);
      this.save(top);
      return top;
    }

    getBestScore() {
      const entries = this.load();
      return entries.length ? entries[0].score : 0;
    }

    getAll() {
      return this.load();
    }
  }

  // ------------------------------------------------------------------------
  // SHARE MANAGER — Web Share API with clipboard fallback
  // ------------------------------------------------------------------------
  class ShareManager {
    constructor(onCopyFallback) {
      this.onCopyFallback = onCopyFallback;
    }

    async share({ name, score }) {
      const text = `I pumped ${formatNumber(score)} $ANSEM in Tap to Pump - The Black Bull Revolution!\n\nThink you can beat me, ${name}?\n\nPlay now!`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'The Black Bull Revolution', text });
          return;
        } catch (e) {
          // user cancelled or share failed — fall through to clipboard
        }
      }
      this.copyToClipboard(text);
    }

    copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => this.onCopyFallback(true),
          () => this.legacyCopy(text)
        );
      } else {
        this.legacyCopy(text);
      }
    }

    legacyCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.onCopyFallback(true);
      } catch (e) {
        this.onCopyFallback(false);
      }
    }
  }

  // ------------------------------------------------------------------------
  // MAIN GAME CONTROLLER
  // ------------------------------------------------------------------------
  class BlackBullGame {
    constructor() {
      this.cacheDom();
      this.audio = new AudioManager();
      this.leaderboard = new Leaderboard();
      this.share = new ShareManager((ok) => this.showToast(ok ? 'Copied!' : 'Could not copy'));
      this.tapFx = new TapEffects({
        rippleLayer: this.dom.tapRipples,
        textLayer: this.dom.floatingTexts,
        particleLayer: this.dom.particles,
      });

      this.playerName = '';
      this.resetRunState();

      this.bindLandingEvents();
      this.bindGameEvents();
      this.bindEndEvents();
      this.bindLeaderboardEvents();

      this.runLoadingSequence();
      this.spawnFloatingIcons();
      new AmbientParticles(this.dom.bgParticles);
    }

    // ---- DOM cache ------------------------------------------------------
    cacheDom() {
      this.dom = {
        bgGradient: document.querySelector('.bg-gradient'),
        bgParticles: $('bgParticles'),

        screens: {
          loading: $('screen-loading'),
          landing: $('screen-landing'),
          countdown: $('screen-countdown'),
          game: $('screen-game'),
          end: $('screen-end'),
          leaderboard: $('screen-leaderboard'),
        },

        loaderFill: $('loaderFill'),
        loaderHint: $('loaderHint'),

        nameInput: $('nameInput'),
        nameError: $('nameError'),
        playBtn: $('playBtn'),
        leaderboardBtn: $('leaderboardBtn'),
        floatingIcons: $('floatingIcons'),

        countdownNumber: $('countdownNumber'),
        countdownSub: $('countdownSub'),

        scoreDisplay: $('scoreDisplay'),
        comboMultiplier: $('comboMultiplier'),
        comboCount: $('comboCount'),
        timerDisplay: $('timerDisplay'),
        timerBox: $('timerBox'),
        energyFill: $('energyFill'),
        energyModeLabel: $('energyModeLabel'),

        stage: $('stage'),
        mover: $('mover'),
        bullHorns: $('bullHorns'),
        ansemWrap: $('ansemWrap'),
        ansemChar: $('ansemChar'),
        ansemGlowEl: document.querySelector('.ansem-glow'),
        tapRipples: $('tapRipples'),
        floatingTexts: $('floatingTexts'),
        particles: $('particles'),
        comboBanner: $('comboBanner'),
        milestoneBanner: $('milestoneBanner'),
        achievementToast: $('achievementToast'),

        endNewAth: $('newAthBanner'),
        endPlayerName: $('endPlayerName'),
        endScore: $('endScore'),
        endCombo: $('endCombo'),
        endBest: $('endBest'),
        endBadges: $('endBadges'),
        playAgainBtn: $('playAgainBtn'),
        endLeaderboardBtn: $('endLeaderboardBtn'),
        shareBtn: $('shareBtn'),

        lbList: $('lbList'),
        lbBackBtn: $('lbBackBtn'),

        toast: $('toast'),
        shareCanvas: $('shareCanvas'),
      };
    }

    resetRunState() {
      this.score = 0;
      this.displayScore = 0;
      this.combo = 0;
      this.highestCombo = 0;
      this.comboMult = 1;
      this.lastTapTime = 0;
      this.comboResetTimer = null;

      this.energy = 0;
      this.bullMode = false;
      this.bullModeTimer = null;
      this.energyDecayTicker = null;

      this.timeLeft = GAME_DURATION;
      this.gameTimerInterval = null;
      this.gameRunning = false;

      clearTimeout(this.moveTimer);
      this.moveTimer = null;

      this.reachedMilestones = new Set();
      this.unlockedAchievements = new Set();
    }

    // ---- Screen management -----------------------------------------------
    showScreen(name) {
      // Guard: ignore redundant calls (e.g. a double-tap on a nav button)
      // so a screen already on top never gets told to re-enter or bounce.
      if (this._currentScreen === name) return;
      this._currentScreen = name;

      // Always give the incoming screen a higher stack position than
      // whatever is leaving, regardless of their order in the HTML. Without
      // this, a screen fading out could stay visually on top of (and catch
      // taps meant for) the screen that just replaced it.
      this._zCounter = (this._zCounter || 10) + 1;
      const enteringZ = this._zCounter;

      Object.entries(this.dom.screens).forEach(([key, el]) => {
        if (key === name) {
          el.style.zIndex = enteringZ;
          el.setAttribute('data-active', 'true');
          el.removeAttribute('data-leaving');
        } else if (el.getAttribute('data-active') === 'true') {
          el.setAttribute('data-leaving', 'true');
          setTimeout(() => {
            el.removeAttribute('data-active');
            el.removeAttribute('data-leaving');
            el.style.zIndex = '';
          }, 350);
        }
      });
    }

    showToast(message) {
      const el = this.dom.toast;
      el.textContent = message;
      el.classList.remove('show');
      void el.offsetWidth; // restart animation
      el.classList.add('show');
    }

    // ---- Loading sequence -------------------------------------------------
    runLoadingSequence() {
      const hints = ['Waking the bull…', 'Loading $ANSEM charts…', 'Charging pump energy…', 'Almost there…'];
      let progress = 0;
      let hintIndex = 0;
      this.dom.loaderHint.textContent = hints[0];
      const interval = setInterval(() => {
        progress += rand(8, 18);
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setTimeout(() => this.showScreen('landing'), 250);
        }
        this.dom.loaderFill.style.width = `${progress}%`;
        const nextHint = Math.floor((progress / 100) * hints.length);
        if (nextHint !== hintIndex && nextHint < hints.length) {
          hintIndex = nextHint;
          this.dom.loaderHint.textContent = hints[hintIndex];
        }
      }, 220);
    }

    spawnFloatingIcons() {
      const container = this.dom.floatingIcons;
      for (let i = 0; i < 14; i++) {
        const el = document.createElement('div');
        el.className = 'ficon';
        el.textContent = FLOAT_ICONS[Math.floor(rand(0, FLOAT_ICONS.length))];
        el.style.left = `${rand(0, 100)}%`;
        el.style.animationDuration = `${rand(10, 22)}s`;
        el.style.animationDelay = `${rand(0, 14)}s`;
        el.style.fontSize = `${rand(14, 28)}px`;
        container.appendChild(el);
      }
    }

    // ---- Landing screen ----------------------------------------------------
    bindLandingEvents() {
      this.dom.playBtn.addEventListener('click', () => this.tryStartGame());
      this.dom.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.tryStartGame();
      });
      this.dom.nameInput.addEventListener('input', () => {
        this.dom.nameError.classList.remove('show');
      });
      this.dom.leaderboardBtn.addEventListener('click', () => this.openLeaderboard('landing'));
    }

    tryStartGame() {
      const name = this.dom.nameInput.value.trim();
      if (!name) {
        this.dom.nameError.classList.add('show');
        this.dom.nameInput.classList.remove('shake');
        void this.dom.nameInput.offsetWidth;
        this.dom.nameInput.classList.add('shake');
        this.dom.nameInput.focus();
        return;
      }
      this.playerName = name.slice(0, 16);
      this.startCountdown();
    }

    // ---- Countdown ----------------------------------------------------------
    startCountdown() {
      this.showScreen('countdown');
      const seq = ['3', '2', '1', 'PUMP!!'];
      let i = 0;

      const step = () => {
        const val = seq[i];
        this.dom.countdownNumber.textContent = i < 3 ? val : '';
        this.dom.countdownSub.textContent = i === 3 ? 'PUMP!!' : '';
        this.dom.countdownNumber.style.animation = 'none';
        void this.dom.countdownNumber.offsetWidth;
        this.dom.countdownNumber.style.animation = '';
        if (i < 3) this.audio.play('countdown', { volume: 0.5 });
        else this.audio.play('super', { volume: 0.6 });

        i++;
        if (i < seq.length) {
          setTimeout(step, 800);
        } else {
          setTimeout(() => this.startGame(), 700);
        }
      };
      step();
    }

    // ---- Game screen setup ---------------------------------------------------
    bindGameEvents() {
      // Only the character itself (.mover) is tappable — tapping empty stage
      // space no longer scores, since the bull roams around and has to be hit.
      const tapTarget = this.dom.mover;
      const handleTap = (clientX, clientY) => {
        if (!this.gameRunning) return;
        this.registerTap(clientX, clientY);
      };

      tapTarget.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTap(e.clientX, e.clientY);
      });

      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && this.gameRunning) {
          e.preventDefault();
          const rect = tapTarget.getBoundingClientRect();
          handleTap(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
      });
    }

    // ---- Character roaming movement ------------------------------------------
    moveCharacter(instant = false) {
      const stage = this.dom.stage;
      const mover = this.dom.mover;
      const stageRect = stage.getBoundingClientRect();
      const size = mover.offsetWidth || 200;
      const maxX = Math.max(0, stageRect.width - size);
      const maxY = Math.max(0, stageRect.height - size);
      const x = rand(0, maxX);
      const y = rand(0, maxY);

      if (instant) mover.classList.add('no-transition');
      mover.style.left = `${x}px`;
      mover.style.top = `${y}px`;
      if (instant) {
        // force reflow so the position applies before re-enabling transitions
        void mover.offsetWidth;
        mover.classList.remove('no-transition');
      }
    }

    scheduleNextMove() {
      clearTimeout(this.moveTimer);
      const delay = rand(800, 1400);
      this.moveTimer = setTimeout(() => {
        if (!this.gameRunning) return;
        this.moveCharacter();
        this.scheduleNextMove();
      }, delay);
    }

    startGame() {
      this.resetRunState();
      this.gameRunning = true;
      this.showScreen('game');
      this.updateScoreDisplay(true);
      this.updateTimerDisplay();
      this.updateEnergyDisplay();
      this.dom.comboMultiplier.classList.remove('show');
      this.audio.startMusic();

      this.gameTimerInterval = setInterval(() => this.tickTimer(), 1000);
      this.energyDecayTicker = setInterval(() => this.tickEnergyDecay(), 200);

      // place the bull immediately (no glide on the very first placement),
      // then have it roam continuously for the rest of the run
      this.moveCharacter(true);
      this.scheduleNextMove();
    }

    tickTimer() {
      this.timeLeft -= 1;
      this.updateTimerDisplay();
      if (this.timeLeft <= 5) {
        this.dom.timerBox.classList.add('danger');
      }
      if (this.timeLeft <= 0) {
        this.endGame();
      }
    }

    updateTimerDisplay() {
      this.dom.timerDisplay.textContent = Math.max(0, this.timeLeft);
    }

    // ---- Tap handling -------------------------------------------------------
    registerTap(clientX, clientY) {
      const now = performance.now();
      this.lastTapTime = now;

      // combo bookkeeping
      this.combo += 1;
      this.highestCombo = Math.max(this.highestCombo, this.combo);
      clearTimeout(this.comboResetTimer);
      this.comboResetTimer = setTimeout(() => this.resetCombo(), COMBO_RESET_MS);
      this.updateComboMultiplier();

      // energy
      this.energy = clamp(this.energy + ENERGY_PER_TAP, 0, 100);
      this.updateEnergyDisplay();
      if (this.energy >= 100 && !this.bullMode) {
        this.activateBlackBullMode();
      }

      // scoring
      const bullMult = this.bullMode ? BLACK_BULL_MULTIPLIER : 1;
      const totalMult = this.comboMult * bullMult;
      const gained = BASE_TAP_VALUE * totalMult;
      this.score += gained;
      this.animateScore();
      this.checkMilestones();
      this.checkAchievements();
      this.updateBackgroundGreenery();

      // visuals at tap location, relative to stage
      const rect = this.dom.stage.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      this.tapFx.ripple(x, y);
      this.tapFx.floatingText(x, y, `+${formatNumber(gained)}`, { superCharged: this.bullMode });
      this.tapFx.burst(x, y, {
        count: this.bullMode ? 18 : 8,
        power: this.bullMode ? 1.6 : 1,
        colors: this.bullMode
          ? ['#fbbf24', '#22ff88', '#a855f7']
          : ['#a855f7', '#22d3ee', '#fbbf24'],
      });

      // character reaction
      this.dom.ansemChar.classList.remove('tap-hit');
      void this.dom.ansemChar.offsetWidth;
      this.dom.ansemChar.classList.add('tap-hit');

      // screen shake
      this.dom.stage.classList.remove('shake-screen');
      void this.dom.stage.offsetWidth;
      this.dom.stage.classList.add('shake-screen');

      this.audio.play(this.bullMode ? 'super' : 'tap', { volume: 0.35 });
      vibrate(this.bullMode ? 30 : 12);

      // hop to a new spot right away so every hit is a fresh target
      this.moveCharacter();
      this.scheduleNextMove();
    }

    resetCombo() {
      this.combo = 0;
      this.comboMult = 1;
      this.dom.comboMultiplier.classList.remove('show');
      this.dom.comboCount.textContent = '';
    }

    updateComboMultiplier() {
      // find highest tier reached
      let tier = null;
      for (const t of COMBO_TIERS) {
        if (this.combo === t.count) tier = t;
        if (this.combo >= t.count) this.comboMult = t.mult;
      }
      this.dom.comboMultiplier.textContent = `x${this.comboMult}`;
      this.dom.comboMultiplier.classList.add('show');
      this.dom.comboCount.textContent = `${this.combo} combo`;

      if (tier) {
        this.showComboBanner(tier.label);
        this.audio.play('combo', { volume: 0.5 });
        vibrate([20, 30, 20]);
      }
    }

    showComboBanner(label) {
      const el = this.dom.comboBanner;
      el.textContent = label;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    // ---- Energy / Black Bull Mode --------------------------------------------
    tickEnergyDecay() {
      if (this.bullMode || !this.gameRunning) return;
      const idle = performance.now() - this.lastTapTime;
      if (idle > 300) {
        this.energy = clamp(this.energy - (ENERGY_DECAY_PER_SEC * 0.2), 0, 100);
        this.updateEnergyDisplay();
      }
    }

    updateEnergyDisplay() {
      this.dom.energyFill.style.width = `${this.energy}%`;
      this.dom.energyFill.classList.toggle('full', this.energy >= 100);
    }

    activateBlackBullMode() {
      this.bullMode = true;
      this.dom.energyModeLabel.textContent = 'BLACK BULL MODE!';
      this.dom.bgGradient.classList.add('bull-mode');
      this.dom.ansemGlowEl.classList.add('bull-mode');
      this.dom.ansemChar.classList.add('bull-mode');
      this.dom.bullHorns.classList.add('active');
      this.dom.stage.classList.add('zoomed');
      this.audio.setMusicSpeed(1.35);
      this.showComboBanner('🐂 BLACK BULL MODE!');
      vibrate([40, 40, 40, 40, 80]);

      let remaining = BLACK_BULL_DURATION;
      this.bullModeTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(this.bullModeTimer);
          this.deactivateBlackBullMode();
        }
      }, 1000);
    }

    deactivateBlackBullMode() {
      this.bullMode = false;
      this.energy = 0;
      this.updateEnergyDisplay();
      this.dom.energyModeLabel.textContent = '';
      this.dom.bgGradient.classList.remove('bull-mode');
      this.dom.ansemGlowEl.classList.remove('bull-mode');
      this.dom.ansemChar.classList.remove('bull-mode');
      this.dom.bullHorns.classList.remove('active');
      this.dom.stage.classList.remove('zoomed');
      this.audio.setMusicSpeed(1);
    }

    // ---- Score display / milestones / achievements ----------------------------
    animateScore() {
      cancelAnimationFrame(this._scoreRaf);
      const start = this.displayScore;
      const end = this.score;
      const startTime = performance.now();
      const duration = 260;
      const step = (now) => {
        const t = clamp((now - startTime) / duration, 0, 1);
        this.displayScore = start + (end - start) * t;
        this.dom.scoreDisplay.textContent = formatNumber(this.displayScore);
        if (t < 1) this._scoreRaf = requestAnimationFrame(step);
      };
      this._scoreRaf = requestAnimationFrame(step);
    }

    updateScoreDisplay(instant) {
      if (instant) {
        this.displayScore = this.score;
        this.dom.scoreDisplay.textContent = formatNumber(this.score);
      }
    }

    updateBackgroundGreenery() {
      // background trends greener as score climbs past 50k
      this.dom.bgGradient.classList.toggle('greener', this.score >= 50000);
    }

    checkMilestones() {
      const currentStep = Math.floor(this.score / MILESTONE_STEP);
      if (currentStep > 0 && !this.reachedMilestones.has(currentStep)) {
        this.reachedMilestones.add(currentStep);
        this.showMilestone(`${formatNumber(currentStep * MILESTONE_STEP)} $ANSEM PUMPED!`);
      }
    }

    checkAchievements() {
      for (const threshold of ACHIEVEMENTS) {
        if (this.score >= threshold && !this.unlockedAchievements.has(threshold)) {
          this.unlockedAchievements.add(threshold);
          this.showAchievement(`🏅 ${formatNumber(threshold)} $ANSEM BADGE UNLOCKED`);
          if (threshold >= 100000) {
            this.showMilestone('🚀 TO THE MOON!');
          }
        }
      }
    }

    showMilestone(text) {
      const el = this.dom.milestoneBanner;
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    showAchievement(text) {
      const el = this.dom.achievementToast;
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    // ---- End of run ------------------------------------------------------
    endGame() {
      this.gameRunning = false;
      clearInterval(this.gameTimerInterval);
      clearInterval(this.energyDecayTicker);
      clearInterval(this.bullModeTimer);
      clearTimeout(this.comboResetTimer);
      clearTimeout(this.moveTimer);
      this.audio.stopMusic();
      this.audio.play('gameover', { volume: 0.6 });
      this.dom.timerBox.classList.remove('danger');
      if (this.bullMode) this.deactivateBlackBullMode();

      const prevBest = this.leaderboard.getBestScore();
      const isNewAth = this.score > prevBest;
      this.leaderboard.add({ name: this.playerName, score: Math.round(this.score), combo: this.highestCombo });
      const bestNow = this.leaderboard.getBestScore();

      this.dom.endPlayerName.textContent = this.playerName;
      this.dom.endScore.textContent = formatNumber(this.score);
      this.dom.endCombo.textContent = this.highestCombo;
      this.dom.endBest.textContent = formatNumber(bestNow);
      this.dom.endNewAth.classList.toggle('show', isNewAth && this.score > 0);

      this.renderEndBadges();
      this.showScreen('end');

      if (isNewAth && this.score > 0) {
        this.launchConfetti();
      }
    }

    renderEndBadges() {
      this.dom.endBadges.innerHTML = '';
      this.unlockedAchievements.forEach((threshold) => {
        const el = document.createElement('span');
        el.className = 'badge';
        el.textContent = `${formatNumber(threshold)}`;
        this.dom.endBadges.appendChild(el);
      });
    }

    launchConfetti() {
      const layer = document.createElement('div');
      layer.className = 'confetti-layer';
      document.body.appendChild(layer);
      const colors = ['#a855f7', '#22d3ee', '#22ff88', '#fbbf24', '#ffffff'];
      for (let i = 0; i < 80; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = `${rand(0, 100)}%`;
        piece.style.width = `${rand(6, 11)}px`;
        piece.style.height = `${rand(8, 16)}px`;
        piece.style.background = colors[Math.floor(rand(0, colors.length))];
        piece.style.animationDuration = `${rand(2.2, 4.2)}s`;
        piece.style.animationDelay = `${rand(0, 0.6)}s`;
        layer.appendChild(piece);
      }
      setTimeout(() => layer.remove(), 5200);
    }

    // ---- End screen events --------------------------------------------------
    bindEndEvents() {
      this.dom.playAgainBtn.addEventListener('click', () => {
        this.dom.nameInput.value = this.playerName;
        this.startCountdown();
      });
      this.dom.endLeaderboardBtn.addEventListener('click', () => this.openLeaderboard('end'));
      this.dom.shareBtn.addEventListener('click', () => this.handleShare());
    }

    // ---- Share card (screenshot-style image) ---------------------------------
    // Draws a shareable PNG of the result onto the hidden canvas so the player
    // can paste/attach an actual image, not just a line of text.
    async generateShareCardBlob() {
      const canvas = this.dom.shareCanvas;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;

      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#150a2e');
      bgGrad.addColorStop(0.55, '#0d0221');
      bgGrad.addColorStop(1, '#07020f');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      const glowBlob = (x, y, r, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      glowBlob(180, 160, 380, 'rgba(168,85,247,0.38)');
      glowBlob(840, 300, 360, 'rgba(34,211,238,0.26)');
      glowBlob(500, 900, 420, 'rgba(34,255,136,0.22)');

      try { await document.fonts.ready; } catch (e) { /* fonts may not be ready offline — draw with fallback fonts */ }

      ctx.textAlign = 'center';

      ctx.font = '700 30px Rajdhani, sans-serif';
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('$ANSEM · SOLANA', W / 2, 120);

      ctx.font = '900 50px Orbitron, sans-serif';
      ctx.fillStyle = '#f5f3ff';
      ctx.fillText('THE BLACK BULL', W / 2, 195);
      ctx.fillStyle = '#a855f7';
      ctx.fillText('REVOLUTION', W / 2, 252);

      ctx.font = '160px sans-serif';
      ctx.fillText('🐂', W / 2, 450);

      ctx.font = '700 26px Rajdhani, sans-serif';
      ctx.fillStyle = '#b3a9d6';
      ctx.fillText('$ANSEM PUMPED', W / 2, 545);

      ctx.font = '900 108px Orbitron, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(formatNumber(this.score), W / 2, 660);

      ctx.font = '700 30px Rajdhani, sans-serif';
      ctx.fillStyle = '#22ff88';
      ctx.fillText(`${this.playerName || 'Anonymous'} · Combo x${this.highestCombo}`, W / 2, 720);

      ctx.font = '600 22px Rajdhani, sans-serif';
      ctx.fillStyle = '#7d72a3';
      ctx.fillText('Tap to Pump — play now and beat this score', W / 2, 920);

      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    async handleShare() {
      const text = `I pumped ${formatNumber(this.score)} $ANSEM in Tap to Pump - The Black Bull Revolution!\n\nThink you can beat me?\n\nPlay now!`;
      let blob = null;
      try {
        blob = await this.generateShareCardBlob();
      } catch (e) { /* canvas generation failed — fall back to text-only share */ }
      const file = blob ? new File([blob], 'black-bull-score.png', { type: 'image/png' }) : null;

      // 1) Native share sheet with the image attached, where supported
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, title: 'The Black Bull Revolution' });
          return;
        } catch (e) { /* user cancelled, or files unsupported at call time — fall through */ }
      }

      // 2) Native share sheet, text only — still hand them the image to attach
      if (navigator.share) {
        try {
          await navigator.share({ text, title: 'The Black Bull Revolution' });
          if (file) this.downloadBlob(file, 'black-bull-score.png');
          return;
        } catch (e) { /* fall through to clipboard/download */ }
      }

      // 3) Desktop clipboard image copy
      if (file && navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
          this.showToast('Score card copied — paste it anywhere!');
          return;
        } catch (e) { /* clipboard image write not permitted — fall through */ }
      }

      // 4) Last resort: download the image and copy the caption text
      if (file) this.downloadBlob(file, 'black-bull-score.png');
      this.share.copyToClipboard(text);
    }

    // ---- Leaderboard screen --------------------------------------------------
    bindLeaderboardEvents() {
      this.dom.lbBackBtn.addEventListener('click', () => {
        this.showScreen(this._lbReturnScreen || 'landing');
      });
    }

    openLeaderboard(returnScreen) {
      this._lbReturnScreen = returnScreen;
      this.renderLeaderboard();
      this.showScreen('leaderboard');
    }

    renderLeaderboard() {
      const entries = this.leaderboard.getAll();
      const list = this.dom.lbList;
      list.innerHTML = '';

      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'lb-empty';
        empty.textContent = 'No pumps yet. Be the first legend.';
        list.appendChild(empty);
        return;
      }

      entries.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        const date = new Date(entry.date);
        const dateStr = isNaN(date) ? '' : date.toLocaleDateString();
        row.innerHTML = `
          <div class="lb-rank">#${i + 1}</div>
          <div class="lb-info">
            <div class="lb-name"></div>
            <div class="lb-meta">Combo x${entry.combo} · ${dateStr}</div>
          </div>
          <div class="lb-score"></div>
        `;
        row.querySelector('.lb-name').textContent = entry.name;
        row.querySelector('.lb-score').textContent = formatNumber(entry.score);
        list.appendChild(row);
      });
    }
  }

  // ------------------------------------------------------------------------
  // BOOT
  // ------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    new BlackBullGame();
  });
})();
