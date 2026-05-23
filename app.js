import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

// ✔️ Список стрімерів
const streamers = [
  "steel",
  "ravshann",
  "renatko",
  "bratishkinoff",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "karas_bobra",
  "art228009",
  "art009228"
];

// ✔️ Зберігаємо, хто вже онлайн (антидубль)
let onlineStatus = {};

// ✔️ Отримуємо Twitch токен
async function getTwitchToken() {
  try {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
    );
    accessToken = res.data.access_token;
    console.log("Twitch token received");
  } catch (err) {
    console.error("Error getting Twitch token:", err.message);
  }
}

// ✔️ Перевіряємо стріми
async function checkStreams() {
  if (!accessToken) return;

  for (const streamer of streamers) {
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

      const isOnline = res.data.data.length > 0;

      // 🔥 Якщо стрімер онлайн і ми ще не надсилали повідомлення
      if (isOnline && !onlineStatus[streamer]) {
        onlineStatus[streamer] = true;

        const streamUrl = `https://twitch.tv/${streamer}`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text: `🔴 ${streamer} запустив стрім на Twitch!\n👉 ${streamUrl}`
          }
        );

        console.log(`Notification sent: ${streamer}`);
      }

      // Якщо стрімер офлайн — скидаємо статус
      if (!isOnline) {
        onlineStatus[streamer] = false;
      }

    } catch (err) {
      console.error(`Error checking ${streamer}:`, err.message);
    }
  }
}

// ✔️ Головна сторінка
app.get("/", (req, res) => {
  res.send("Bot is running (Polling mode)");
});

// ✔️ Запуск сервера
app.listen(process.env.PORT || 3000, async () => {
  console.log("Bot running on Render (Polling mode)");
  await getTwitchToken();

  // Оновлюємо токен кожні 3 години
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);

  // Перевіряємо стрімерів кожні 30 секунд
  setInterval(checkStreams, 30 * 1000);
});
