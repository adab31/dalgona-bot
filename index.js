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

/* ================= PORT SERVER ================= */
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running!");
}).listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));

/* ================= DISCORD CLIENT ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
    db[id] = { coins: 10000, level: 1, xp: 0, lastDaily: 0 };
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
  { name: "Triangle", reward: 10000 },
  { name: "Circle", reward: 25000 },
  { name: "Star", reward: 40000 },
  { name: "Umbrella", reward: 75000 }
];

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const commands = [
    new SlashCommandBuilder().setName("dalgona").setDescription("Play Dalgona Game"),
    new SlashCommandBuilder().setName("balance").setDescription("Check coins"),
    new SlashCommandBuilder().setName("daily").setDescription("Claim daily reward"),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Top players")
  ].map(c => c.toJSON());
  await client.application.commands.set(commands);
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const user = getUser(interaction.user.id);

  /* ===== BALANCE ===== */
  if (interaction.commandName === "balance") {
    return interaction.reply(`💰 Coins: ${user.coins}\n⭐ Level: ${user.level}`);
  }

  /* ===== DAILY ===== */
  if (interaction.commandName === "daily") {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return interaction.reply("⏰ Daily already claimed!");
    user.lastDaily = now;
    user.coins += 1000; // daily reward
    saveDB();
    return interaction.reply("🎁 You received 1,000 coins!");
  }

  /* ===== DALGONA GAME (COOKIE SELECT + PRO PROGRESS) ===== */
  if (interaction.commandName === "dalgona") {

    // Cookie selection buttons
    const cookieRow = new ActionRowBuilder().addComponents(
      ...dalgonaLevels.map(c =>
        new ButtonBuilder()
          .setCustomId(`choose_${c.name}`)
          .setLabel(c.name)
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({ content: "🍪 Choose a cookie type to start!", components: [cookieRow] });

    const filterChoose = i => i.user.id === interaction.user.id && i.customId.startsWith("choose_");
    const collectorChoose = interaction.channel.createMessageComponentCollector({ filter: filterChoose });

    collectorChoose.on("collect", async i => {
      const cookieName = i.customId.split("_")[1];
      const game = dalgonaLevels.find(c => c.name === cookieName);
      collectorChoose.stop();

      // Initialize game state
      let cookieIntegrity = 100;
      let carvingProgress = 0;

      // Embed
      const embed = new EmbedBuilder()
        .setTitle(`🍪 DALGONA: 💀 ${game.name.toUpperCase()}`)
        .setThumbnail("https://i.ibb.co/2vT8M1R/cookie.png")
        .setColor("Yellow")
        .addFields(
          { name: "Player", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Prize", value: `$${game.reward}`, inline: true },
          { name: "Cookie Integrity", value: `100%`, inline: false },
          { name: "Carving Progress", value: `[${"⬛".repeat(0)}${"⬜".repeat(10)}]`, inline: false }
        );

      // Carving buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("light").setLabel("🟢 Light").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("medium").setLabel("🔵 Medium").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("heavy").setLabel("🔴 Heavy").setStyle(ButtonStyle.Danger)
      );

      await i.update({ content: "Start carving your cookie!", embeds: [embed], components: [row] });

      const filterCarve = j => j.user.id === interaction.user.id && ["light", "medium", "heavy"].includes(j.customId);
      const collectorCarve = interaction.channel.createMessageComponentCollector({ filter: filterCarve });

      collectorCarve.on("collect", async j => {
        // Update progress
        if (j.customId === "light") { carvingProgress += 1; cookieIntegrity -= 2; }
        else if (j.customId === "medium") { carvingProgress += 2; cookieIntegrity -= 5; }
        else if (j.customId === "heavy") { carvingProgress += 4; cookieIntegrity -= 10; }

        if (cookieIntegrity < 0) cookieIntegrity = 0;
        if (carvingProgress > 10) carvingProgress = 10;

        const updatedEmbed = EmbedBuilder.from(embed)
          .spliceFields(2, 2,
            { name: "Cookie Integrity", value: `${cookieIntegrity}%`, inline: false },
            { name: "Carving Progress", value: `[${"🟩".repeat(carvingProgress)}${"⬛".repeat(10 - carvingProgress)}]`, inline: false }
          );

        await j.update({ embeds: [updatedEmbed], components: [row] });

        // SUCCESS
        if (carvingProgress >= 10) {
          user.coins += game.reward;
          addXP(user, 50);
          saveDB();

          const successEmbed = new EmbedBuilder()
            .setTitle("✅ Cookie Completed!")
            .setDescription(`You successfully carved the ${game.name}!\n💰 +${game.reward} coins\n⭐ +50 XP`)
            .setColor("Green")
            .setThumbnail("https://i.ibb.co/2vT8M1R/cookie.png");

          collectorCarve.stop();
          return interaction.editReply({ embeds: [successEmbed], components: [] });
        }

        // FAIL
        if (cookieIntegrity <= 0) {
          const failEmbed = new EmbedBuilder()
            .setTitle("💀 Cookie Broke!")
            .setDescription(`Oh no! The cookie broke before completion.`)
            .setColor("Red")
            .setThumbnail("https://i.ibb.co/2vT8M1R/cookie.png");

          collectorCarve.stop();
          return interaction.editReply({ embeds: [failEmbed], components: [] });
        }
      });
    });
  }

  /* ===== LEADERBOARD ===== */
  if (interaction.commandName === "leaderboard") {
    const sorted = Object.entries(db).sort((a, b) => b[1].coins - a[1].coins).slice(0, 5);
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
