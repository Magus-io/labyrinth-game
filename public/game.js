// ====================== Labyrinth Game (static scene + path-sticky + dev tools) ======================
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#0a0e1a',
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 } }
  },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let player, playerNameLabel, cursors, wasd, otherPlayers = {}, room, scene;

// DEV overlay
let devMode = false;
let devGrid, devInfo;
let devRects = [];       // [{ type:'solid'|'portal'|'path', r: Phaser.GameObjects.Rectangle }]
let devPaths = [];       // [{x,y,w,h}]
let currentType = 'solid';      // 'solid' | 'path' | 'portal'
let currentSizeIdx = 1;         // 1|2|3  (multiples of GRID)
let isDraggingBand = false;
let bandStart = null;
let bandGhost = null;

// constants
const GRID = 32;

// ---------- Phaser preload ----------
function preload() {
  this.load.image('bg', 'assets/scenes/BR01.png');
  this.load.image('hero', 'assets/sprites/hero01.png');
}

// ---------- Phaser create ----------
async function create() {
  scene = this;
  const cam = this.cameras.main;

  // ===== Single static scene (no scrolling) =====
  const SEGMENTS = 1;
  const segW = cam.width;

  for (let i = 0; i < SEGMENTS; i++) {
    // Slight overscan to hide any edge halo/bottom gap
    const img = this.add.image(i * segW - 2, -2, 'bg').setOrigin(0, 0).setDepth(-10);
    img.setDisplaySize(segW + 4, cam.height + 4);
  }

  // world bounds == screen size
  const worldW = segW * SEGMENTS;
  this.physics.world.setBounds(0, 0, worldW, cam.height);
  cam.setBounds(0, 0, worldW, cam.height);
  cam.setScroll(0, 0);               // pin camera
  cam.stopFollow();                  // ensure not following anything

  // ===== Multiplayer join =====
  const client = new Colyseus.Client('ws://localhost:3000');
  const name = window.prompt("Enter your name (or Discord name):", "Keven");
  room = await client.joinOrCreate('game_room', { name });
  console.log('✅ Connected! My ID:', room.sessionId);

  // ===== Player sprite =====
  player = this.physics.add.image(300, 360, 'hero')
    .setScale(0.12)              // ~65% of the previous size
    .setDepth(1)
    .setCollideWorldBounds(true);

  // Small hit box for nicer movement
  player.body.setSize(12, 12, true);

  cursors = this.input.keyboard.createCursorKeys();
  wasd = this.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    right: Phaser.Input.Keyboard.KeyCodes.D
  });

  // ===== Static blockers =====
  const solids = this.physics.add.staticGroup();
  function addBlock(x, y, w, h, a = 0.12) {
    const r = scene.add.rectangle(x, y, w, h, 0x00ff00, a).setOrigin(0, 0).setDepth(5);
    scene.physics.add.existing(r, true);
    solids.add(r);
    return r;
  }
  // Bottom lip and a couple of rough blockers (tune later)
  addBlock(0, cam.height - 36, worldW, 36, 0.08);
  addBlock(260, cam.height - 118, 160, 12, 0.08);
  addBlock(470, cam.height - 170, 140, 18, 0.08);
  this.physics.add.collider(player, solids);

  // ===== Path sticky system =====
  // A path is a rectangle strip. When the player's X is inside a path's X-range,
  // we gently pull the player's Y toward the strip's vertical center.
  function addPath(x, y, w, h) {
    devPaths.push({ x, y, w, h });
    // Only draw the debug rect while in dev mode
    const r = scene.add.rectangle(x, y, w, h, 0xffcc00, 0.18).setOrigin(0, 0).setDepth(9999);
    r.setStrokeStyle(1, 0xffcc00);
    r.setVisible(devMode);
    devRects.push({ type: 'path', r });
    return r;
  }

  // Example initial path (rough walkway). Adjust in dev mode.
  addPath(120, cam.height - 140, 520, 24);

  // ===== Portals (kept stairs portal as example; NO left wrap) =====
  function makePortal(x, y, w, h, key) {
    const z = scene.add.zone(x, y, w, h).setOrigin(0, 0);
    scene.physics.world.enable(z, 1);
    scene.physics.add.overlap(player, z, () => loadZone(key), null, scene);
    const dbg = scene.add.rectangle(x, y, w, h, 0x00aaff, 0.18).setOrigin(0, 0).setDepth(9999);
    dbg.setStrokeStyle(1, 0x00aaff).setVisible(devMode);
    devRects.push({ type: 'portal', r: dbg });
    return z;
  }
  makePortal(620, cam.height - 182, 60, 60, 'BR_STAIRS');

  // Log asset sizes once for notes
  {
    const bgImg = scene.textures.get('bg').getSourceImage();
    const heroImg = scene.textures.get('hero').getSourceImage();
    console.log('BG size:', bgImg.width, bgImg.height);
    console.log('Hero size:', heroImg.width, heroImg.height);
  }

  // ===== Name label =====
  playerNameLabel = this.add.text(
    player.x, player.y - 14, name || 'You',
    { fontSize: '14px', color: '#ffffff' }
  ).setOrigin(0.5);

  // ===== Multiplayer events =====
  room.onMessage('playerJoined', (data) => {
    if (data.sessionId !== room.sessionId && !otherPlayers[data.sessionId]) {
      const sprite = scene.add.image(data.x, data.y, 'hero').setScale(0.12).setDepth(1);
      const nameLabel = scene.add.text(data.x, data.y - 14, data.name || 'Guest',
        { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(2);
      otherPlayers[data.sessionId] = { sprite, nameLabel };
    }
  });

  room.onMessage('playerMoved', (data) => {
    if (otherPlayers[data.sessionId]) {
      const other = otherPlayers[data.sessionId];
      other.sprite.x = data.x;
      other.sprite.y = data.y;
      other.nameLabel.x = data.x;
      other.nameLabel.y = data.y - 14;
    }
  });

  room.onMessage('playerLeft', (data) => {
    if (otherPlayers[data.sessionId]) {
      otherPlayers[data.sessionId].sprite.destroy();
      otherPlayers[data.sessionId].nameLabel.destroy();
      delete otherPlayers[data.sessionId];
    }
  });

  // ===== DEV MODE (in-browser editor) =====
  initializeDevTools();
}

// ---------- Phaser update ----------
function update() {
  if (!player) return;

  // movement
  player.body.setVelocity(0);
  let moved = false;

  if ((cursors.left && cursors.left.isDown) || (wasd && wasd.left.isDown)) { player.body.velocity.x = -200; moved = true; }
  if ((cursors.right && cursors.right.isDown) || (wasd && wasd.right.isDown)) { player.body.velocity.x = 200; moved = true; }
  if ((cursors.up && cursors.up.isDown) || (wasd && wasd.up.isDown)) { player.body.velocity.y = -200; moved = true; }
  if ((cursors.down && cursors.down.isDown) || (wasd && wasd.down.isDown)) { player.body.velocity.y = 200; moved = true; }

  // Sticky-to-path: gently pull Y toward the nearest path strip under current X
  const sticky = findActivePathForX(player.x);
  if (sticky) {
    const targetY = sticky.y + sticky.h / 2;
    player.y = Phaser.Math.Linear(player.y, targetY, 0.18);
    // if you're on a path, damp vertical velocity a bit
    player.body.velocity.y *= 0.4;
  }

  if (moved && room) {
    room.send('move', { x: player.x, y: player.y });
  }
  if (playerNameLabel) {
    playerNameLabel.x = player.x;
    playerNameLabel.y = player.y - 14;
  }
}

// ---------- Helpers ----------
function findActivePathForX(px) {
  // return the path whose X-range contains the player X (if multiple, choose the closest by Y)
  let best = null, bestDy = Infinity;
  for (const p of devPaths) {
    if (px >= p.x && px <= p.x + p.w) {
      const centerY = p.y + p.h / 2;
      const dy = Math.abs(player.y - centerY);
      if (dy < bestDy) { bestDy = dy; best = p; }
    }
  }
  return best;
}

function loadZone(key) {
  const cam = scene.cameras?.main;
  if (!cam) return;
  cam.fadeOut(150, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    console.log('Portal →', key);
    cam.fadeIn(150, 0, 0, 0);
    if (room) room.send('zoneChange', { key });
  });
}

// =================== DEV TOOLS ===================
function initializeDevTools() {
  const cam = scene.cameras.main;
  const worldW = cam.width; // static single panel
  const snap = (n) => Math.round(n / GRID) * GRID;

  // Enable with ?dev=1 or toggle with E
  devMode = new URLSearchParams(location.search).has('dev');

  devGrid = scene.add.grid(0, 0, worldW, cam.height, GRID, GRID, 0x00ff00, 0.05, 0x00ff00, 0.1)
    .setOrigin(0, 0).setDepth(9998).setVisible(devMode);

  const helpText = () =>
    `DEV: E=toggle  G=grid  S=save  T=type(${currentType})  1/2/3=size  Click=add  Drag=box
(type: solid=green, path=yellow, portal=blue)`;

  devInfo = scene.add.text(8, 8, helpText(), { fontSize: '12px', color: '#9cff9c' })
    .setDepth(9999).setScrollFactor(0).setVisible(devMode);

  // ----- create dev rect (with snap and color per type) -----
  const addDevRect = (x, y, w, h, type) => {
    const color = type === 'portal' ? 0x00aaff : type === 'path' ? 0xffcc00 : 0x00ff00;
    const r = scene.add.rectangle(snap(x), snap(y), snap(w), snap(h), color, 0.22)
      .setOrigin(0, 0).setDepth(9999).setStrokeStyle(1, color)
      .setInteractive({ draggable: true });
    r.setData('devRect', true);
    r.setData('type', type);
    scene.input.setDraggable(r);
    devRects.push({ type, r });

    // also apply to the game systems immediately
    if (type === 'solid') {
      // convert this visual to an actual collider block
      const block = scene.add.rectangle(r.x, r.y, r.width, r.height, 0x00ff00, 0.0).setOrigin(0, 0);
      scene.physics.add.existing(block, true);
      // invisible but effective; leave the green rect as editor overlay
    } else if (type === 'path') {
      devPaths.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    } else if (type === 'portal') {
      // just a visual; use S=save output to wire in real portals as needed
    }
    return r;
  };

  // ----- pointer-based creation (click = one/two/three box, drag = free box) -----
  const sizeForIdx = (idx) => {
    const w = GRID * (idx === 1 ? 1 : idx === 2 ? 2 : 3);
    const h = GRID * 0.75; // nice strip height
    return { w, h };
  };

  let clickedExisting = false;

  // detect clicking an existing rect so we don't create another
  scene.input.on('gameobjectdown', (_p, obj) => {
    if (!devMode) return;
    if (obj.getData('devRect')) clickedExisting = true;
  });

  scene.input.on('pointerdown', (pointer) => {
    if (!devMode) return;
    clickedExisting = false;
    isDraggingBand = true;
    bandStart = { x: pointer.worldX, y: pointer.worldY };
    if (bandGhost) { bandGhost.destroy(); bandGhost = null; }
  });

  scene.input.on('pointermove', (pointer) => {
    if (!devMode || !isDraggingBand) return;
    const x = Math.min(bandStart.x, pointer.worldX);
    const y = Math.min(bandStart.y, pointer.worldY);
    const w = Math.abs(pointer.worldX - bandStart.x);
    const h = Math.abs(pointer.worldY - bandStart.y);
    if (!bandGhost) {
      const color = currentType === 'portal' ? 0x00aaff : currentType === 'path' ? 0xffcc00 : 0x00ff00;
      bandGhost = scene.add.rectangle(x, y, w, h, color, 0.12).setOrigin(0, 0).setDepth(9999).setStrokeStyle(1, 0xffffff);
    } else {
      bandGhost.setPosition(x, y);
      bandGhost.setSize(w, h);
    }
  });

  scene.input.on('pointerup', (pointer) => {
    if (!devMode) return;

    // Drag-band create
    if (isDraggingBand && bandGhost && !clickedExisting) {
      const x = Math.min(bandStart.x, pointer.worldX);
      const y = Math.min(bandStart.y, pointer.worldY);
      const w = Math.abs(pointer.worldX - bandStart.x);
      const h = Math.abs(pointer.worldY - bandStart.y);
      addDevRect(x, y, w, h, currentType);
      bandGhost.destroy(); bandGhost = null;
      isDraggingBand = false;
      return;
    }
    isDraggingBand = false;

    // Simple click create (one/two/three box)
    if (!clickedExisting) {
      const { w, h } = sizeForIdx(currentSizeIdx);
      addDevRect(pointer.worldX, pointer.worldY, w, h, currentType);
    }
    clickedExisting = false;
  });

  // drag to move rectangles (snap on release)
  scene.input.on('dragstart', (_p, obj) => {
    if (!devMode) return;
    if (obj.getData('devRect')) obj.setAlpha(0.35);
  });
  scene.input.on('drag', (_p, obj, dragX, dragY) => {
    if (!devMode) return;
    if (obj.getData('devRect')) { obj.x = dragX; obj.y = dragY; }
  });
  scene.input.on('dragend', (_p, obj) => {
    if (!devMode) return;
    if (obj.getData('devRect')) {
      obj.x = snap(obj.x); obj.y = snap(obj.y);
      obj.setAlpha(0.22);
    }
  });

  // ----- keys -----
  const keyE = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  const keyG = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  const keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
  const keyT = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
  const key1 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
  const key2 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  const key3 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

  keyE.on('down', () => {
    devMode = !devMode;
    devGrid.setVisible(devMode);
    devInfo.setText(helpText());
    devInfo.setVisible(devMode);
    devRects.forEach(({ r }) => r.setVisible(devMode));
    console.log('DEV mode:', devMode ? 'ON' : 'OFF');
  });

  keyG.on('down', () => { if (devGrid) devGrid.setVisible(!devGrid.visible); });

  keyS.on('down', async () => {
    // Emit code you can paste back into game.js later
    const data = devRects.map(({ type, r }) => ({
      type, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)
    }));
    const code = data.map(d => {
      if (d.type === 'solid') return `addBlock(${d.x}, ${d.y}, ${d.w}, ${d.h});`;
      if (d.type === 'path')  return `addPath(${d.x}, ${d.y}, ${d.w}, ${d.h});`;
      return `makePortal(${d.x}, ${d.y}, ${d.w}, ${d.h}, 'BR_NEXT');`;
    }).join('\n');
    console.log('DEV SAVE:\n' + code);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        console.log('Copied to clipboard.');
      }
    } catch (_) {}
  });

  keyT.on('down', () => {
    currentType = currentType === 'solid' ? 'path' : currentType === 'path' ? 'portal' : 'solid';
    devInfo.setText(helpText());
    console.log('Type =', currentType);
  });

  key1.on('down', () => { currentSizeIdx = 1; devInfo.setText(helpText()); });
  key2.on('down', () => { currentSizeIdx = 2; devInfo.setText(helpText()); });
  key3.on('down', () => { currentSizeIdx = 3; devInfo.setText(helpText()); });
}