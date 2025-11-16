const express = require('express');
const { Server } = require('colyseus');
const { createServer } = require('http');
const path = require('path');
const fs = require('fs');
const GameRoom = require('./GameRoom');

const app = express();
const port = 3000;
const zonesDir = path.join(__dirname, 'public', 'zones');

app.use(express.json({ limit: '1mb' }));

// Serve static files (your game)
app.use(express.static('public'));

function safeZoneKey(key) {
    return key.replace(/[^A-Za-z0-9_-]/g, '');
}

app.get('/editor/zones/:key', (req, res) => {
    const zoneKey = safeZoneKey(req.params.key);
    const file = path.join(zonesDir, `${zoneKey}.json`);
    if (fs.existsSync(file)) {
        return res.sendFile(file);
    }
    return res.json({
        sceneKey: zoneKey,
        bg: `${zoneKey}.png`,
        camera: { static: true },
        spawn: { x: 320, y: 380 },
        solids: [],
        paths: [],
        portals: []
    });
});

app.post('/editor/zones/:key', (req, res) => {
    const zoneKey = safeZoneKey(req.params.key);
    const dir = zonesDir;
    const file = path.join(dir, `${zoneKey}.json`);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        console.error('Failed to ensure zones dir:', err);
    }
    fs.writeFile(file, JSON.stringify(req.body, null, 2), (err) => {
        if (err) {
            console.error('Failed to save zone JSON:', err);
            return res.status(500).json({ error: String(err) });
        }
        res.json({ ok: true });
    });
});

// Create HTTP & WebSocket servers
const gameServer = new Server({
    server: createServer(app)
});

// Register your game room
gameServer.define('game_room', GameRoom);

gameServer.listen(port);
console.log(`🎮 Labyrinth Game Server running on http://localhost:${port}`);
console.log(`🌀 Multiplayer rooms ready!`);
