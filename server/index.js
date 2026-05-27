'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameState = require('./GameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.static(path.join(__dirname, '..', 'client')));

// rooms: Map<roomCode, { game: GameState, players: { p1?: socketId, p2?: socketId }, rematchVotes: Set }>
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoleForSocket(room, socketId) {
  if (room.players.p1 === socketId) return 'p1';
  if (room.players.p2 === socketId) return 'p2';
  return null;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('create_room', () => {
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));

    const room = {
      game: new GameState(),
      players: { p1: socket.id, p2: null },
      rematchVotes: new Set(),
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('room_created', { roomCode });
    console.log(`Room created: ${roomCode} by ${socket.id}`);
  });

  socket.on('join_room', ({ roomCode }) => {
    const code = (roomCode || '').toString().toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('join_error', { reason: 'Room not found.' });
      return;
    }
    if (room.players.p2 !== null) {
      socket.emit('join_error', { reason: 'Room is full.' });
      return;
    }
    if (room.players.p1 === socket.id) {
      socket.emit('join_error', { reason: 'You created this room.' });
      return;
    }

    room.players.p2 = socket.id;
    socket.join(code);
    socket.roomCode = code;

    room.game._state.status = 'playing';
    const state = room.game.getState();

    io.to(room.players.p1).emit('game_start', { playerRole: 'p1', state });
    io.to(room.players.p2).emit('game_start', { playerRole: 'p2', state });
    console.log(`Game started in room ${code}`);
  });

  socket.on('move_pawn', ({ roomCode, to }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const role = getRoleForSocket(room, socket.id);
    if (!role) return;

    const result = room.game.movePawn(role, to);
    if (!result.success) {
      socket.emit('invalid_move', { reason: result.reason });
      return;
    }

    io.to(roomCode).emit('state_update', { state: result.state });

    const winner = room.game.isGameOver();
    if (winner) {
      io.to(roomCode).emit('game_over', { winner });
    }
  });

  socket.on('place_wall', ({ roomCode, wall }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const role = getRoleForSocket(room, socket.id);
    if (!role) return;

    const result = room.game.placeWall(role, wall);
    if (!result.success) {
      socket.emit('invalid_move', { reason: result.reason });
      return;
    }

    io.to(roomCode).emit('state_update', { state: result.state });
  });

  socket.on('rematch', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const role = getRoleForSocket(room, socket.id);
    if (!role) return;

    room.rematchVotes.add(role);

    if (room.rematchVotes.size === 2) {
      room.game = new GameState();
      room.game._state.status = 'playing';
      room.rematchVotes.clear();
      const state = room.game.getState();
      io.to(roomCode).emit('rematch_ready', { state });
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const role = getRoleForSocket(room, socket.id);
    if (role) {
      room.players[role] = null;
    }

    const { p1, p2 } = room.players;
    if (p1 === null && p2 === null) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (both players gone)`);
    } else {
      // Notify remaining player
      const remaining = p1 || p2;
      if (remaining) {
        io.to(remaining).emit('opponent_disconnected', {});
      }
    }

    console.log(`Socket disconnected: ${socket.id} from room ${roomCode}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quoridor server running on http://localhost:${PORT}`);
});
