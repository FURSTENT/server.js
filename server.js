const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
// 部屋（キー）ごとのホストWebsocketを管理
const rooms = new Map();

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 1. 配信側：ルーム登録
      if (data.type === 'host_register') {
        rooms.set(data.key, ws);
        ws.roomKey = data.key;
        ws.isHost = true;
        console.log(`[Host Registered] Room Key: ${data.key}`);
      }

      // 2. 受信側：接続リクエスト（キーでホストを検索）
      else if (data.type === 'join_request') {
        const hostWs = rooms.get(data.key);
        if (hostWs && hostWs.readyState === WebSocket.OPEN) {
          // ★ここが抜けてた：クライアント側にもroomKeyを持たせる
          ws.roomKey = data.key;
          ws.isHost = false;

          data.clientIp = clientIp;
          data.clientSocketId = Math.random().toString(36).substring(7);
          ws.clientSocketId = data.clientSocketId;
          hostWs.clientWs = ws; // クライアントの参照を保持
          hostWs.send(JSON.stringify(data));
          console.log(`[Join Request] Key: ${data.key} from IP: ${clientIp}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: '指定された接続コードの配信が見つからないゾ' }));
        }
      }

      // 3. Offer (SDP) の転送 (ホスト -> クライアント)
      else if (data.type === 'offer_approved') {
        if (ws.clientWs && ws.clientWs.readyState === WebSocket.OPEN) {
          ws.clientWs.send(JSON.stringify(data));
        }
      }

      // 4. Answer (SDP) の転送 (クライアント -> ホスト)
      else if (data.type === 'answer') {
        if (ws.roomKey && rooms.has(ws.roomKey)) {
          const hostWs = rooms.get(ws.roomKey);
          if (hostWs && hostWs.readyState === WebSocket.OPEN) {
            hostWs.send(JSON.stringify(data));
            console.log(`[Answer Relayed] Key: ${ws.roomKey}`);
          }
        } else {
          console.log(`[Answer Failed] ws.roomKey is not set or room missing`);
        }
      }

      // 5. ICE candidate の転送（STUNだけだと繋がらない環境向けの保険。今後追加するなら）
      // else if (data.type === 'ice_candidate') { ... }

    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (ws.isHost && ws.roomKey) {
      // ホストが切れたときだけルームを消す（クライアント切断で誤って消さない）
      rooms.delete(ws.roomKey);
      console.log(`[Host Disconnected] Room Key: ${ws.roomKey}`);
    }
  });
});

console.log("VERYMETA Signaling Server running on port 8080");
