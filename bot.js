const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/user');
const crypto = require('crypto');

// Create Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// Connect to MongoDB (using environment variables from render.com)
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Function to generate random password
function generatePassword() {
  return crypto.randomBytes(8).toString('hex');
}

// Function to update user data
async function updateUserData(member) {
  try {
    let user = await User.findOne({ discordId: member.id });
    const roles = member.roles.cache.map(role => role.name);

    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        discordId: member.id,
        username: member.user.username,
        roles: roles,
        password: generatePassword() // Generate initial password
      });
    } else {
      // Update existing user
      user.username = member.user.username;
      user.roles = roles;
    }

    // Update boolean flags based on roles
    user.updateFlags();
    user.lastUpdated = new Date();
    await user.save();
    
    return user;
  } catch (error) {
    console.error(`Error updating user ${member.user.username}:`, error);
  }
}

// Function to update all users
async function updateAllUsers() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const members = await guild.members.fetch();
    console.log(`Updating ${members.size} users...`);

    const updatePromises = members.map(member => updateUserData(member));
    await Promise.all(updatePromises);

    console.log('All users updated successfully');
  } catch (error) {
    console.error('Error updating users:', error);
  }
}

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Set up interval to update users every minute
  setInterval(updateAllUsers, 60000);
  
  // Run initial update
  updateAllUsers();
});

// Login to Discord using token from render.com environment
client.login(process.env.DISCORD_TOKEN);

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});