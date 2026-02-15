require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");
const http = require("http");

/* ================= PORT SERVER FOR RENDER ================= */
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running!");
}).listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});

/* ================= DISCORD CLIENT ================= */
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

  /* ===== DALGONA GAME (BUTTON INTERFACE) ===== */
  if (interaction.commandName === "dalgona") {

    const levelIndex = user.level - 1;

    if (!dalgonaLevels[levelIndex]) {
      return interaction.reply("🏆 You completed all levels!");
    }

    const game = dalgonaLevels[levelIndex];

    let cookieIntegrity = 100; // start at 100%
    let carvingProgress = 0; // start at 0%

    // Embed
    const embed = new EmbedBuilder()
      .setTitle(`🍪 DALGONA: 💀 ${game.name.toUpperCase()}`)
      .setThumbnail("https://i.ibb.co/2vT8M1R/cookie.png")
      .addFields(
        { name: "Player", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Prize", value: `$${game.reward}`, inline: true },
        { name: "Time", value: `${game.time}s`, inline: true },
        { name: "Cookie Integrity", value: `100%`, inline: false },
        { name: "Carving Progress", value: `[${"⬛".repeat(0)}${"⬜".repeat(10)}]`, inline: false }
      );

    // Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("light").setLabel("🟢 Light").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("medium").setLabel("🔵 Medium").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("heavy").setLabel("🔴 Heavy").setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

    const filter = i => i.user.id === interaction.user.id && ["light", "medium", "heavy"].includes(i.customId);

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: game.time * 1000
    });

    collector.on("collect", async i => {
      if (i.customId === "light") {
        carvingProgress += 1; 
        cookieIntegrity -= 2; 
      } else if (i.customId === "medium") {
        carvingProgress += 2;
        cookieIntegrity -= 5;
      } else if (i.customId === "heavy") {
        carvingProgress += 4;
        cookieIntegrity -= 10;
      }

      if (cookieIntegrity < 0) cookieIntegrity = 0;
      if (carvingProgress > 10) carvingProgress = 10;

      const updatedEmbed = EmbedBuilder.from(embed)
        .spliceFields(3, 2,
          { name: "Cookie Integrity", value: `${cookieIntegrity}%`, inline: false },
          { name: "Carving Progress", value: `[${"🟩".repeat(carvingProgress)}${"⬛".repeat(10 - carvingProgress)}]`, inline: false }
        );

      await i.update({ embeds: [updatedEmbed], components: [row] });

      // Win condition
      if (carvingProgress >= 10) {
        user.coins += game.reward;
        addXP(user, 50);
        saveDB();
        collector.stop("completed");
        interaction.editReply({ content: `✅ Success! +${game.reward} coins`, components: [], embeds: [] });
      }

      // Lose condition
      if (cookieIntegrity <= 0) {
        collector.stop("broke");
        interaction.editReply({ content: "💀 Cookie broke! Try again.", components: [], embeds: [] });
      }
    });

    collector.on("end", (collected, reason) => {
      if (reason === "time") {
        interaction.editReply({ content: "⏰ Time's up! Cookie broke!", components: [], embeds: [] });
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
