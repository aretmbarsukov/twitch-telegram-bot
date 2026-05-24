import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

// Ловим ВСЕ ошибки, чтобы Render не падал
process.on("uncaughtException", err => console.log("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.log("UNHANDLED:", err));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

const streamers = [
  "steel",
  "ravshann",
  "renatko",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "kerimch1k",
  "renatkobmw"
];

let streamInfo = {};

// ===============================
// 📌 Получение Twitch токена
// ===============================
async function getTwitchToken() {
  try {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
    );
    accessToken = res.data.access_token;
    console.log("Twitch token обновлён");
  } catch (err) {
    console.log("Ошибка получения токена:", err);
  }
}

// ===============================
// 📌 Проверка одного стримера
// ===============================
async function checkStreamer(streamer) {
  try {
    const res = await axios.get(
      `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return res.data.data.length > 0 ? res.data.data[0] : null;
  } catch (err) {
    console.log("API error:", err);
    return null;
  }
}

// ===============================
// 📌 Проверка всех стримеров
// ===============================
async function checkStreams() {
  if (!accessToken) return;

  for (const streamer of streamers) {
    const stream = await checkStreamer(streamer);

    // 🟢 СТРИМ ОНЛАЙН
    if (stream) {
      const title = stream.title || "Без названия";
      const category = stream.game_name || "Без категории";

      const text =
        `🟢 *${stream.user_login}*\n` +
        `🎮 Категория: *${category}*\n` +
        `📝 Название: ${title}\n` +
        `🔗 https://twitch.tv/${stream.user_login}`;

      // Новый стрим
      if (!streamInfo[streamer] || !streamInfo[streamer].online) {
        const msg = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: "Markdown"
          }
        );

        streamInfo[streamer] = {
          messageId: msg.data.result.message_id,
          title,
          category,
          startedAt: new Date(stream.started_at),
          online: true
        };

        console.log("ONLINE:", streamer);
        continue;
      }

      // Обновление названия/категории
      if (
        streamInfo[streamer].title !== title ||
        streamInfo[streamer].category !== category
      ) {
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: streamInfo[streamer].messageId
          }
        );

        const msg = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: "Markdown"
          }
        );

        streamInfo[streamer].messageId = msg.data.result.message_id;
        streamInfo[streamer].title = title;
        streamInfo[streamer].category = category;

        console.log("UPDATED:", streamer);
      }
    }

    // 🔴 СТРИМ ОФФЛАЙН
    else {
      if (streamInfo[streamer] && streamInfo[streamer].online) {
        const start = streamInfo[streamer].startedAt;
        const end = new Date();

        const diff = Math.floor((end - start) / 1000);
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);

        const offlineText =
          `🔴 *${streamer}*\n` +
          `Стрим завершён\n` +
          `🟢 Начался: ${start.toLocaleString()}\n` +
          `🔴 Завершился: ${end.toLocaleString()}\n` +
          `⏱️ Длился: ${hours} ч ${minutes} мин`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: streamInfo[streamer].messageId,
            text: offlineText,
            parse_mode: "Markdown"
          }
        );

        streamInfo[streamer].online = false;

        console.log("OFFLINE:", streamer);
      }
    }
  }
}

// ===============================
// 📌 Express
// ===============================
app.get("/", (req, res) => {
  res.send("Bot is running");
});

// ===============================
// 📌 Запуск
// ===============================
app.listen(process.env.PORT || 3000, async () => {
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
  console.log("Bot started");
});