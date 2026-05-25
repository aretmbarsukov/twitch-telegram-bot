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
  "tadzheek","dedadam","vitollo_13","ereek","dankzlv","bratishkinoff"
];

// ---------------- Ініціалізація state ----------------

let state = {
  onlineStatus: {},
  streamStartTime: {},
  lastTitle: {},
  lastCategory: {},
  userId: {} // ← ВАЖЛИВО: тепер завжди існує
};

if (fs.existsSync("state.json")) {
  try {
    const loaded = JSON.parse(fs.readFileSync("state.json", "utf8"));
    state = { ...state, ...loaded };
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

function formatDuration(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function ensureDir(path) {
  fs.mkdirSync(path, { recursive: true });
}

async function getTwitchToken() {
  const res = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
  );
  return res.data.access_token;
}

async function getUserId(login, token) {
  const res = await axios.get(
    `https://api.twitch.tv/helix/users?login=${login}`,
    { headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } }
  );
  return res.data.data.length ? res.data.data[0].id : null;
}

async function checkStreamer(streamer, token) {
  const res = await axios.get(
    `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
    { headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } }
  );
  return res.data.data.length > 0 ? res.data.data[0] : null;
}

async function getTopClipsForStream(streamer, userId, startIso, endIso, token) {
  if (!userId) return [];

  const params = new URLSearchParams({
    broadcaster_id: userId,
    started_at: startIso,
    ended_at: endIso,
    first: "100"
  });

  const res = await axios.get(
    `https://api.twitch.tv/helix/clips?${params.toString()}`,
    { headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } }
  );

  const clips = res.data.data || [];
  if (!clips.length) return [];

  clips.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  return clips.slice(0, 3).map(c => ({
    title: c.title,
    url: c.url,
    views: c.view_count
  }));
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
        const userLogin = stream.user_login;
        const userId = stream.user_id;

        state.userId[streamer] = userId;

        const text =
          `🟢 <b>${userLogin}</b>\n` +
          `🎮 Категория: <b>${category}</b>\n` +
          `📝 Название: ${title}\n` +
          `🔗 https://twitch.tv/${userLogin}`;

        // ---- Новий стрім ----
        if (!state.onlineStatus[streamer]) {
          const msgId = await sendMessage(text);
          state.onlineStatus[streamer] = msgId;
          state.streamStartTime[streamer] = new Date().toISOString();
          state.lastTitle[streamer] = title;
          state.lastCategory[streamer] = category;
          console.log("ONLINE:", streamer);
        }

        // ---- Оновлення ----
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
          const start = state.streamStartTime[streamer];
          const end = new Date().toISOString();
          const durationText = formatDuration(start, end);

          // Топ‑3 кліпа
          let topClipsText = "";
          try {
            const userId = state.userId[streamer] || (await getUserId(streamer, token));
            const topClips = await getTopClipsForStream(streamer, userId, start, end, token);

            if (topClips.length) {
              topClipsText =
                "\n\n🎬 <b>Топ 3 клипа за стрим:</b>\n" +
                topClips
                  .map(
                    (c, i) =>
                      `${i + 1}) ${escapeHtml(c.title)} — <b>${c.views}</b> просмотров\n${c.url}`
                  )
                  .join("\n");

              // зберігаємо JSON
              const dateKey = start.slice(0, 10);
              const dir = `data/${streamer}/clips`;
              ensureDir(dir);
              fs.writeFileSync(
                `${dir}/${dateKey}.json`,
                JSON.stringify({ start, end, top3: topClips }, null, 2),
                "utf8"
              );
            } else {
              topClipsText = "\n\n🎬 Кліпів за цей стрім не знайдено.";
            }
          } catch (e) {
            topClipsText = "\n\n🎬 Не вдалося отримати кліпи.";
          }

          await deleteMessage(state.onlineStatus[streamer]);

          const offlineText =
            `🔴 <b>${streamer}</b>\n` +
            `Стрим завершён\n` +
            `🟢 Начался: ${formatDate(start)}\n` +
            `🔴 Завершился: ${formatDate(end)}\n` +
            `⏱️ Длился: ${durationText}` +
            topClipsText;

          await sendMessage(offlineText);

          state.onlineStatus[streamer] = null;
          state.streamStartTime[streamer] = null;
          state.lastTitle[streamer] = null;
          state.lastCategory[streamer] = null;
          console.log("OFFLINE:", streamer);
        }
      }

    } catch (err) {
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
