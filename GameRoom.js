const { Room } = require('colyseus');

class GameRoom extends Room {
    onCreate(options) {
        console.log('🌀 GameRoom created!');
        this.state = { players: {} };
        
        // When someone moves, tell EVERYONE
        this.onMessage("move", (client, data) => {
            if (this.state.players[client.sessionId]) {
                this.state.players[client.sessionId].x = data.x;
                this.state.players[client.sessionId].y = data.y;
                
                // BROADCAST to everyone else
                this.broadcast('playerMoved', {
                    sessionId: client.sessionId,
                    x: data.x,
                    y: data.y
                }, { except: client });
            }
        });
    }
    
    onJoin(client) {
        console.log(`✅ Player ${client.sessionId} joined!`);
        
        // Add player to state
        this.state.players[client.sessionId] = {
            x: 400,
            y: 300,
            sessionId: client.sessionId
        };
        
        // Tell EXISTING players about new player
        this.broadcast('playerJoined', {
            sessionId: client.sessionId,
            x: 400,
            y: 300
        }, { except: client });
        
        // Tell NEW player about ALL existing players
        for (let id in this.state.players) {
            if (id !== client.sessionId) {
                client.send('playerJoined', {
                    sessionId: id,
                    x: this.state.players[id].x,
                    y: this.state.players[id].y
                });
            }
        }
    }
    
    onLeave(client) {
        console.log(`❌ Player ${client.sessionId} left`);
        delete this.state.players[client.sessionId];
        this.broadcast('playerLeft', { sessionId: client.sessionId });
    }
}

module.exports = GameRoom;