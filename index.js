require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  Collection
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= DATABASE ================= */

let db = {};
if (fs.existsSync("./data.json")) {
  db = JSON.parse(fs.readFileSync("./data.json"));
}

function saveDB() {
  fs.writeFileSync("./data.json", JSON.stringify(db, null, 2));
}

function getUser(id) {
  if (!db[id]) {
    db[id] = {
      coins: 10000,
      level: 1,
      xp: 0,
      lastDaily: 0
    };
  }
  return db[id];
}

/* ================= LEVEL SYSTEM ================= */

function addXP(user, amount) {
  user.xp += amount;
  const need = user.level * 100;

  if (user.xp >= need) {
    user.level++;
    user.xp = 0;
    user.coins += 5000;
  }
}

/* ================= DALGONA LEVELS ================= */

const dalgonaLevels = [
  { name: "Triangle", reward: 10000, time: 3 },
  { name: "Circle", reward: 25000, time: 5 },
  { name: "Star", reward: 40000, time: 7 },
  { name: "Umbrella", reward: 75000, time: 10 }
];

/* ================= READY ================= */

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("dalgona")
      .setDescription("Play Dalgona Game"),

    new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check coins"),

    new SlashCommandBuilder()
      .setName("daily")
      .setDescription("Claim daily reward"),

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Top players")
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const user = getUser(interaction.user.id);

  /* ===== BALANCE ===== */
  if (interaction.commandName === "balance") {
    return interaction.reply(
      `💰 Coins: ${user.coins}\n⭐ Level: ${user.level}`
    );
  }

  /* ===== DAILY ===== */
  if (interaction.commandName === "daily") {
    const now = Date.now();

    if (now - user.lastDaily < 86400000) {
      return interaction.reply("⏰ Daily already claimed!");
    }

    user.lastDaily = now;
    user.coins += 20000;
    saveDB();

    return interaction.reply("🎁 You received 20,000 coins!");
  }

  /* ===== DALGONA GAME ===== */
  if (interaction.commandName === "dalgona") {

    const levelIndex = user.level - 1;

    if (!dalgonaLevels[levelIndex]) {
      return interaction.reply("🏆 You completed all levels!");
    }

    const game = dalgonaLevels[levelIndex];

    await interaction.reply(
      `🍪 Level ${user.level}: **${game.name}**
Type \`cut\` within ${game.time} seconds!`
    );

    const filter = m =>
      m.author.id === interaction.user.id &&
      m.content.toLowerCase() === "cut";

    const collector =
      interaction.channel.createMessageCollector({
        filter,
        time: game.time * 1000,
        max: 1
      });

    collector.on("collect", async () => {
      user.coins += game.reward;
      addXP(user, 50);
      saveDB();

      interaction.followUp(
        `✅ Success! +${game.reward} coins`
      );
    });

    collector.on("end", collected => {
      if (!collected.size) {
        interaction.followUp("💀 Cookie broke! Try again.");
      }
    });
  }

  /* ===== LEADERBOARD ===== */
  if (interaction.commandName === "leaderboard") {

    const sorted = Object.entries(db)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 5);

    let text = "🏆 Leaderboard\n\n";

    for (let i = 0; i < sorted.length; i++) {
      const member = await client.users.fetch(sorted[i][0]);
      text += `${i + 1}. ${member.username} — ${sorted[i][1].coins} coins\n`;
    }

    interaction.reply(text);
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);

