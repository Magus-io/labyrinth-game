const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#0a0e1a',
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 } }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let player, cursors, otherPlayers = {}, room, scene;

function preload() {}

async function create() {
    scene = this;
    const client = new Colyseus.Client('ws://localhost:3000');
    
    room = await client.joinOrCreate('game_room');
    console.log('✅ Connected! My ID:', room.sessionId);
    
    // YOUR player (pink)
    player = this.add.rectangle(400, 300, 32, 32, 0xff00ff);
    this.physics.add.existing(player);
    cursors = this.input.keyboard.createCursorKeys();
    
    // Listen for players joining (both existing and new)
    room.onMessage('playerJoined', (data) => {
        if (data.sessionId !== room.sessionId && !otherPlayers[data.sessionId]) {
            console.log('Creating TEAL box for player:', data.sessionId);
            otherPlayers[data.sessionId] = scene.add.rectangle(data.x, data.y, 32, 32, 0x00ffff);
        }
    });
    
    // Listen for players MOVING
    room.onMessage('playerMoved', (data) => {
        if (otherPlayers[data.sessionId]) {
            console.log('Moving teal box:', data.sessionId, data.x, data.y);
            otherPlayers[data.sessionId].x = data.x;
            otherPlayers[data.sessionId].y = data.y;
        }
    });
    
    // Listen for players leaving
    room.onMessage('playerLeft', (data) => {
        if (otherPlayers[data.sessionId]) {
            otherPlayers[data.sessionId].destroy();
            delete otherPlayers[data.sessionId];
        }
    });
}

function update() {
    if (!player) return;
    
    player.body.setVelocity(0);
    let moved = false;
    
    if (cursors.left.isDown) { player.body.velocity.x = -200; moved = true; }
    if (cursors.right.isDown) { player.body.velocity.x = 200; moved = true; }
    if (cursors.up.isDown) { player.body.velocity.y = -200; moved = true; }
    if (cursors.down.isDown) { player.body.velocity.y = 200; moved = true; }
    
    if (moved && room) {
        room.send('move', { x: player.x, y: player.y });
    }
}