// ====================== Labyrinth Game (static scene + path-sticky + dev tools) ======================
const GAME_W = 1536;
const GAME_H = 1024;
const config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: 'game-root',
  backgroundColor: '#0b0d10',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 0.8
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: { preload, create, update }
};

new Phaser.Game(config);

let player, playerNameLabel, cursors, wasd, otherPlayers = {}, room, scene;
const BG_KEY = 'BR_BG';
const BG_FILE = 'assets/scenes/BR01.png';
let currentZoneData = { bgKey: BG_KEY };
let bgImage = null;

// DEV overlay
let devMode = false;
let devInfo, devGrid;
let devRects = [];       // [{ r: Phaser.GameObjects.Rectangle, data: { x,y,w,h } }]
let pathSegments = [];
let currentSizeIdx = 1;         // path width preset
let dragMovedExisting = false;
let freeWalk = true;
let lastPathRect = null;

// constants
const GRID = 32;
const HUD_COLOR = '#39ff14';
const HUD_STYLE = { fontFamily: 'monospace', fontSize: '22px', color: HUD_COLOR, stroke: '#001a00', strokeThickness: 4, padding: { x: 6, y: 6 } };
const PATH_COLOR = 0xffcc00;
const SIZE_PRESETS = [GRID, GRID * 2, GRID * 3, GRID * 4];

function devHelpText() {
  return [
    'DEV',
    `E: edit mode   F: free-walk ${freeWalk ? 'ON' : 'OFF'}`,
    '1-4: path size presets   G: grid on/off',
    'Left-click: add segment   Drag: move   Right-click: delete'
  ].join('\n');
}

function playerHalfHeight() {
  const body = player?.body;
  return (player?.displayHeight || player?.height || (body ? body.height : 32)) / 2;
}

function getPathRects() {
  return pathSegments;
}

function footprints() {
  const half = playerHalfHeight();
  return {
    x: player.x,
    y: player.y + half,
    half
  };
}

function rectanglesTouch(a, b) {
  const epsilon = 0.05 * GRID;
  return (
    Math.abs((a.x + a.w) - b.x) <= epsilon ||
    Math.abs((b.x + b.w) - a.x) <= epsilon ||
    Math.abs((a.y + a.h) - b.y) <= epsilon ||
    Math.abs((b.y + b.h) - a.y) <= epsilon
  );
}

function mergePathSegments(rect) {
  for (const seg of pathSegments) {
    if (seg === rect) continue;
    const alignedHoriz = seg.y === rect.y && seg.h === rect.h && (rectanglesTouch(seg, rect));
    const alignedVert = seg.x === rect.x && seg.w === rect.w && (rectanglesTouch(seg, rect));
    if (alignedHoriz) {
      const minX = Math.min(seg.x, rect.x);
      const maxX = Math.max(seg.x + seg.w, rect.x + rect.w);
      seg.x = minX;
      seg.w = maxX - minX;
      pathSegments = pathSegments.filter((entry) => entry !== rect);
      return;
    }
    if (alignedVert) {
      const minY = Math.min(seg.y, rect.y);
      const maxY = Math.max(seg.y + seg.h, rect.y + rect.h);
      seg.y = minY;
      seg.h = maxY - minY;
      pathSegments = pathSegments.filter((entry) => entry !== rect);
      return;
    }
  }
}

function findContainingPath(px, py, padding = 0) {
  for (const p of pathSegments) {
    if (
      px >= p.x - padding &&
      px <= p.x + p.w + padding &&
      py >= p.y - padding &&
      py <= p.y + p.h + padding
    ) {
      return p;
    }
  }
  return null;
}

function clampFootToRect(rect, padding = 0, easing = 0.4) {
  if (!rect) return false;
  const feet = footprints();
  let clamped = false;
  const minX = rect.x - padding;
  const maxX = rect.x + rect.w + padding;
  if (feet.x < minX) {
    player.x = Phaser.Math.Linear(player.x, player.x + (minX - feet.x), easing);
    clamped = true;
  } else if (feet.x > maxX) {
    player.x = Phaser.Math.Linear(player.x, player.x - (feet.x - maxX), easing);
    clamped = true;
  }
  const minY = rect.y - padding;
  const maxY = rect.y + rect.h + padding;
  if (feet.y < minY) {
    player.y = Phaser.Math.Linear(player.y, player.y + (minY - feet.y), easing);
    clamped = true;
  } else if (feet.y > maxY) {
    player.y = Phaser.Math.Linear(player.y, player.y - (feet.y - maxY), easing);
    clamped = true;
  }
  if (clamped) {
    lastPathRect = rect;
  }
  return clamped;
}

function showBackground(sceneRef, bgKey) {
  if (!sceneRef) return;
  if (bgImage) bgImage.destroy();
  bgImage = sceneRef.add.image(0, 0, bgKey)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(-100);
}

function renderPathSegments() {
  if (!scene) return;
  devRects.forEach(({ r }) => r.destroy());
  devRects = [];
  pathSegments.forEach((seg) => {
    const rect = scene.add.rectangle(seg.x, seg.y, seg.w, seg.h, PATH_COLOR, devMode ? 0.45 : 0.2)
      .setOrigin(0, 0)
      .setDepth(devMode ? 9999 : 0);
    rect.setData('devRect', true);
    rect.setData('dataRef', seg);
    if (devMode) {
      rect.setStrokeStyle(1, PATH_COLOR);
      rect.setInteractive({ draggable: true });
      scene.input.setDraggable(rect);
    } else {
      rect.disableInteractive();
    }
    devRects.push({ r: rect, data: seg });
  });
}

// ---------- Phaser preload ----------
function preload() {
  this.load.image(BG_KEY, BG_FILE);
  this.load.image('hero', 'assets/sprites/hero01.png');
}

// ---------- Phaser create ----------
async function create() {
  scene = this;
  const cam = this.cameras.main;
  this.input.mouse?.disableContextMenu?.();

  // ===== Single static scene (no scrolling) =====
  const worldW = config.width;
  const worldH = config.height;
  this.physics.world.setBounds(0, 0, worldW, worldH);
  cam.setBounds(0, 0, worldW, worldH);
  cam.setScroll(0, 0);
  cam.stopFollow();
  cam.setRoundPixels(true);
  cam.setZoom(1);
  const bgKey = currentZoneData?.bgKey || BG_KEY;
  showBackground(this, bgKey);

  // ===== Multiplayer join =====
  const client = new Colyseus.Client('ws://localhost:3000');
  const name = window.prompt("Enter your name (or Discord name):", "Keven");
  room = await client.joinOrCreate('game_room', { name });
  console.log('✅ Connected! My ID:', room.sessionId);

  // ===== Player sprite =====
  player = this.physics.add.image(300, 360, 'hero')
    .setScale(0.126)
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

  // Log asset sizes once for notes
  {
    const bgImg = scene.textures.get(bgKey).getSourceImage();
    const heroImg = scene.textures.get('hero').getSourceImage();
    console.log('BG size:', bgImg.width, bgImg.height);
    console.log('Hero size:', heroImg.width, heroImg.height);
  }

  // ===== Name label =====
  playerNameLabel = this.add.text(
    player.x, player.y - 67, name || 'You',
    { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }
  ).setOrigin(0.5).setStroke('#000000', 4);

  // ===== Multiplayer events =====
  room.onMessage('playerJoined', (data) => {
    if (data.sessionId !== room.sessionId && !otherPlayers[data.sessionId]) {
      const sprite = scene.add.image(data.x, data.y, 'hero').setScale(0.126).setDepth(1);
      const nameLabel = scene.add.text(data.x, data.y - 67, data.name || 'Guest',
        { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2).setStroke('#000000', 4);
      otherPlayers[data.sessionId] = { sprite, nameLabel };
    }
  });

  room.onMessage('playerMoved', (data) => {
    if (otherPlayers[data.sessionId]) {
      const other = otherPlayers[data.sessionId];
      other.sprite.x = data.x;
      other.sprite.y = data.y;
      other.nameLabel.x = data.x;
      other.nameLabel.y = data.y - 67;
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
  const left = (cursors.left && cursors.left.isDown) || (wasd && wasd.left.isDown);
  const right = (cursors.right && cursors.right.isDown) || (wasd && wasd.right.isDown);
  const up = (cursors.up && cursors.up.isDown) || (wasd && wasd.up.isDown);
  const down = (cursors.down && cursors.down.isDown) || (wasd && wasd.down.isDown);
  const vx = (right ? 1 : 0) - (left ? 1 : 0);
  const vy = (down ? 1 : 0) - (up ? 1 : 0);
  const SPEED = 200;
  player.setVelocity(vx * SPEED, vy * SPEED);

  if (!freeWalk && pathSegments.length) {
    const half = playerHalfHeight();
    const strictRect = findContainingPath(player.x, player.y, 0);
    if (strictRect) {
      lastPathRect = strictRect;
      clampFootToRect(strictRect, 0, 0.3);
    } else {
      const toleranceRect = findContainingPath(player.x, player.y, half);
      if (toleranceRect) {
        clampFootToRect(toleranceRect, half * 0.8, 0.3);
      } else if (lastPathRect && clampFootToRect(lastPathRect, half * 0.5, 0.2)) {
        player.body.velocity.x *= 0.5;
        player.body.velocity.y *= 0.5;
      } else {
        const nearest = findContainingPath(player.x, player.y, GRID * 4);
        if (nearest && clampFootToRect(nearest, half, 0.2)) {
          player.body.velocity.x *= 0.4;
          player.body.velocity.y *= 0.4;
        } else {
          player.body.setVelocity(0, 0);
        }
      }
    }
  } else if (freeWalk) {
    lastPathRect = null;
  }

  const moving = Math.abs(vx) + Math.abs(vy) > 0;

  if (player.anims) {
    player.anims.play(moving ? 'run' : 'idle', true);
    if (vx !== 0) player.setFlipX(vx < 0);
  }

  if (moving && room) {
    room.send('move', { x: player.x, y: player.y });
  }
  if (playerNameLabel) {
    playerNameLabel.x = player.x;
    playerNameLabel.y = player.y - 67;
  }
}

// ---------- Helpers ----------
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

  if (devGrid) devGrid.destroy();
  devGrid = scene.add.grid(0, 0, worldW, cam.height, GRID, GRID, 0x39ff14, 0.03, 0x39ff14, 0.12)
    .setOrigin(0, 0)
    .setDepth(500)
    .setVisible(devMode);

  devInfo = scene.add.text(8, 8, devHelpText(), HUD_STYLE)
    .setDepth(9999).setScrollFactor(0).setVisible(devMode);
  devInfo.setStyle({ color: '#39ff14', backgroundColor: '#000000aa' });

  const addPathSegment = (x, y, w, h) => {
    const snappedX = snap(x);
    const snappedY = snap(y);
    const snappedW = Math.max(GRID, snap(w));
    const snappedH = Math.max(GRID * 0.75, snap(h));
    pathSegments.push({ x: snappedX, y: snappedY, w: snappedW, h: snappedH });
    mergePathSegments();
    renderPathSegments();
  };

  const sizeForIdx = (idx) => {
    const size = SIZE_PRESETS[idx - 1] || SIZE_PRESETS[0];
    return { w: size, h: size };
  };

  scene.input.on('gameobjectdown', (pointer, obj) => {
    if (!devMode) return;
    if (!obj.getData('devRect')) return;
    if (pointer.rightButtonDown()) {
      const seg = obj.getData('dataRef');
      pathSegments = pathSegments.filter((entry) => entry !== seg);
      renderPathSegments();
      pointer.event?.preventDefault?.();
      pointer.event?.stopPropagation?.();
      return;
    }
  });

  scene.input.on('pointerdown', (pointer, currentlyOver = []) => {
    if (!devMode) return;
    if (pointer.rightButtonDown()) return;
    dragMovedExisting = false;
    const overExisting = currentlyOver.some((obj) => obj?.getData?.('devRect'));
    if (overExisting) return;
    const { w, h } = sizeForIdx(currentSizeIdx);
    addPathSegment(pointer.worldX - w / 2, pointer.worldY - h / 2, w, h);
  });

  scene.input.on('dragstart', (_p, obj) => {
    if (!devMode) return;
    if (obj.getData('devRect')) {
      dragMovedExisting = true;
      obj.setAlpha(0.35);
    }
  });

  scene.input.on('drag', (_p, obj, dragX, dragY) => {
    if (!devMode) return;
    if (obj.getData('devRect')) {
      obj.x = dragX;
      obj.y = dragY;
      const seg = obj.getData('dataRef');
      if (seg) {
        seg.x = dragX;
        seg.y = dragY;
      }
    }
  });

  scene.input.on('dragend', (_p, obj) => {
    if (!devMode) return;
    if (obj.getData('devRect')) {
      const seg = obj.getData('dataRef');
      if (seg) {
        seg.x = snap(obj.x);
        seg.y = snap(obj.y);
        seg.w = Math.max(GRID, snap(obj.width));
        seg.h = Math.max(GRID * 0.75, snap(obj.height));
      }
      mergePathSegments();
      renderPathSegments();
      dragMovedExisting = false;
    }
  });

  const keyE = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  const keyG = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  const key1 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
  const key2 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  const key3 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
  const key4 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
  const keyF = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

  keyE.on('down', () => {
    devMode = !devMode;
    devInfo.setText(devHelpText());
    devInfo.setVisible(devMode);
    if (devGrid) devGrid.setVisible(devMode);
    renderPathSegments();
    console.log('DEV mode:', devMode ? 'ON' : 'OFF');
  });

  keyG.on('down', () => {
    if (devGrid) devGrid.setVisible(!devGrid.visible);
  });

  key1.on('down', () => { currentSizeIdx = 1; devInfo.setText(devHelpText()); });
  key2.on('down', () => { currentSizeIdx = 2; devInfo.setText(devHelpText()); });
  key3.on('down', () => { currentSizeIdx = 3; devInfo.setText(devHelpText()); });
  key4.on('down', () => { currentSizeIdx = 4; devInfo.setText(devHelpText()); });
  keyF.on('down', () => {
    freeWalk = !freeWalk;
    console.log('Free-walk mode:', freeWalk ? 'ON' : 'OFF');
    if (devInfo) devInfo.setText(devHelpText());
  });

  renderPathSegments();
}
