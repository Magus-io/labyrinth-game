const express = require('express');
const { Server } = require('colyseus');
const { createServer } = require('http');
const GameRoom = require('./GameRoom');

const app = express();
const port = 3000;

// Serve static files (your game)
app.use(express.static('public'));

// Create HTTP & WebSocket servers
const gameServer = new Server({
    server: createServer(app)
});

// Register your game room
gameServer.define('game_room', GameRoom);

gameServer.listen(port);
console.log(`🎮 Labyrinth Game Server running on http://localhost:${port}`);
console.log(`🌀 Multiplayer rooms ready!`);