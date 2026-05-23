import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ===============================
// 📌 Надсилання помилки в Telegram
// ===============================
async function sendErrorToTelegram(error) {
  const text =
    `🔥 *BOT ERROR ALERT*\n\n` +
    `❗ Помилка:\n\`\`\`\n${error.stack || error}\n\`\`\`\n` +
    `🕒 Час: ${new Date().toISOString()}`;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown"
      }
    );
  } catch (err) {
    console.log("Помилка надсилання помилки в Telegram:", err);
  }
}

// ===============================
// 📌 safeAxios — будь-яка помилка → в Telegram
// ===============================
async function safeAxios(request) {
  try {
    return await request();
  } catch (err) {
    await sendErrorToTelegram(err);
    throw err;
  }
}

// ===============================
// 📌 ТЕСТОВА ПОМИЛКА (ГАРАНТОВАНА)
// ===============================
async function testError() {
  await safeAxios(() =>
    axios.get("https://api.twitch.tv/helix/STREAMSSSSSSSSSS") // спеціально зламаний URL
  );
}

// ===============================
// 📌 Express
// ===============================
app.get("/", (req, res) => {
  res.send("Bot is running (test mode)");
});

app.listen(process.env.PORT || 3000, async () => {
  console.log("Test bot started. Помилка прилетить за 5–30 секунд.");
  setInterval(testError, 5000); // кожні 5 секунд буде помилка
});