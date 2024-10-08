import { WebSocket, WebSocketServer } from 'ws';

const wss = new WebSocketServer({
  port: 9001,
});

wss.on('connection', (webSocket: WebSocket) => {
  webSocket.on('message', (message) => {
    console.log(message);    
  });
  webSocket.on('close', (message) => {
    console.log('close', message);
  });
});
