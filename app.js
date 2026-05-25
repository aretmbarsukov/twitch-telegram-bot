import axios from "axios";
import fs from "fs";

// ---------------- Глобальні ловці помилок ----------------

async function sendFatal(text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
      { chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }
    );
  } catch {}
}

process.on("unhandledRejection", async (reason) => {
  await sendFatal(`⚠️ <b>Неперехоплена помилка:</b>\n${reason}`);
});

process.on("uncaughtException", async (err) => {
  await sendFatal(`🔥 <b>Критична помилка:</b>\n${err.message}`);
  process.exit(1);
});

// ---------------- Основні змінні ----------------

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

const streamers = [
  "steel","ravshann","renatko","steelaaga","ravshanbtw",
  "anarabdullaev","kerimch1k","renatkobmw","blslan",
  "tadzheek","dedadam","vitollo_13","ereek","dankzlv","ant1ka","bratishkinoff"
];

let state = { onlineStatus: {}, streamStartTime: {}, lastTitle: {}, lastCategory: {} };
if (fs.existsSync("state.json")) {
  try {
    state = JSON.parse(fs.readFileSync("state.json", "utf8"));
  } catch {
    console.log("Помилка читання state.json, починаємо з нуля");
  }
}

// ---------------- Допоміжні функції ----------------

function escapeHtml(text) {
  return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function formatDate(date) {
  return new Date(date).toLocaleString("ru-RU", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

function formatDuration(start) {
  const ms = Date.now() - new Date(start).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

async function getTwitchToken() {
  const res = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
  );
  return res.data.access_token;
}

async function checkStreamer(streamer, token) {
  const res = await axios.get(
    `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
    { headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } }
  );
  return res.data.data.length > 0 ? res.data.data[0] : null;
}

async function sendMessage(text) {
  const res = await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }
  );
  return res.data.result.message_id;
}

async function editMessage(messageId, text) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
    { chat_id: TELEGRAM_CHAT_ID, message_id: messageId, text, parse_mode: "HTML" }
  );
}

async function deleteMessage(messageId) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
    { chat_id: TELEGRAM_CHAT_ID, message_id: messageId }
  );
}

// ---------------- Основна логіка ----------------

async function main() {
  const token = await getTwitchToken();
  console.log("🔍 Перевірка:", new Date().toLocaleTimeString("uk-UA"));

  for (const streamer of streamers) {
    try {
      const stream = await checkStreamer(streamer, token);

      if (stream) {
        const title = escapeHtml(stream.title || "Без названия");
        const category = escapeHtml(stream.game_name || "Без категории");

        const text =
          `🟢 <b>${stream.user_login}</b>\n` +
          `🎮 Категория: <b>${category}</b>\n` +
          `📝 Название: ${title}\n` +
          `🔗 https://twitch.tv/${stream.user_login}`;

        // ---- Новий стрім ----
        if (!state.onlineStatus[streamer]) {
          const msgId = await sendMessage(text);
          state.onlineStatus[streamer] = msgId;
          state.streamStartTime[streamer] = new Date().toISOString();
          state.lastTitle[streamer] = title;
          state.lastCategory[streamer] = category;
          console.log("ONLINE:", streamer);
        }

        // ---- Оновлення назви або категорії ----
        else if (
          state.lastTitle[streamer] !== title ||
          state.lastCategory[streamer] !== category
        ) {
          await editMessage(state.onlineStatus[streamer], text);
          state.lastTitle[streamer] = title;
          state.lastCategory[streamer] = category;
          console.log("UPDATED:", streamer);
        }

      } else {
        // ---- Стрімер офлайн ----
        if (state.onlineStatus[streamer]) {
          await deleteMessage(state.onlineStatus[streamer]);

          const offlineText =
            `🔴 <b>${streamer}</b>\n` +
            `Стрим завершён\n` +
            `🟢 Начался: ${formatDate(state.streamStartTime[streamer])}\n` +
            `🔴 Завершился: ${formatDate(new Date())}\n` +
            `⏱️ Длился: ${formatDuration(state.streamStartTime[streamer])}`;

          await sendMessage(offlineText);

          state.onlineStatus[streamer] = null;
          state.streamStartTime[streamer] = null;
          state.lastTitle[streamer] = null;
          state.lastCategory[streamer] = null;
          console.log("OFFLINE:", streamer);
        }
      }

    } catch (err) {
      console.log("Помилка для", streamer, ":", err.message);
      await sendMessage(`⚠️ Помилка бота для <b>${streamer}</b>:\n${err.message}`).catch(() => {});
    }
  }

  fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
  console.log("✅ Готово");
}

main().catch(async (err) => {
  await sendFatal(`🚨 <b>Бот впав:</b>\n${err.message}`);
  process.exit(1);
});
