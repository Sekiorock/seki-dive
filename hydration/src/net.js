// hydration/src/net.js
// 対戦の通信（ハイドレーション・ビート仕様書 9章のファイル構成）。
// 4つのワールドで共通の部屋の仕組み（shared/room.js）を、ハイドレーション・ビートから使うための入口。
export {
  ROOM, serverNow, battleAllowed, createRoom, joinRoom, watchRoom, updateMe, updateRoom,
  leaveRoom, sendAttack, claimOnce, isDropped, ranking, prizeSplit, fixResult, resultOf,
} from '../../shared/room.js';
