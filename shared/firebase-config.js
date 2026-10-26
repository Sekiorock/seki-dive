// shared/firebase-config.js
// Firebase の設定値。手順は FIREBASE_SETUP.md を見てください。
//
// Firebase のコンソールで「ウェブアプリを追加」すると出てくる firebaseConfig の中身を、
// 下の FIREBASE_CONFIG にそのまま書き写します（apiKey などの値は公開しても大丈夫な値です。
// 守りは database.rules.json のルールで行います）。
//
// apiKey と databaseURL が空のままなら、セキオダイブは「この端末だけ」で動きます（v0.3 と同じ）。

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDCWMytXdOqe7z7caWnofHhgJCcA1HzHYA",
  authDomain: "seki-dive.firebaseapp.com",
  databaseURL: "https://seki-dive-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "seki-dive",
  storageBucket: "seki-dive.firebasestorage.app",
  messagingSenderId: "460451797083",
  appId: "1:460451797083:web:a3e5aa260fb94e8541877e"
};

// Firebase の部品の版（www.gstatic.com から読み込む。全ワールドで同じ版を使う）
export const FIREBASE_SDK_VERSION = '10.12.2';

// つながるまで待つ時間（ミリ秒）。これを過ぎたら「この端末だけ」で動く
export const CONNECT_TIMEOUT_MS = 10000;
