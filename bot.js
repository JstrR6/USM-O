const { Client, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const { User } = require('./models/user');

// Configure bot with ALL necessary intents
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// Connect to MongoDB with error handling
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Handle database connection errors
mongoose.connection.on('error', err => {
    console.error('MongoDB Error:', err);
});

// Main function to sync a single user
async function syncUserData(member) {
    try {
        console.log(`Attempting to sync user: ${member.user.username}`);
        
        // Map roles to include id and name
        const roles = member.roles.cache.map(role => ({
            id: role.id,
            name: role.name
        }));

        // Log the roles being saved
        console.log(`Roles for ${member.user.username}:`, roles);

        // Use findOneAndUpdate with explicit options
        const updatedUser = await User.findOneAndUpdate(
            { discordId: member.user.id },
            {
                $set: {
                    username: member.user.username,
                    discordId: member.user.id,
                    roles: roles,
                    xp: 0  // Set default XP
                }
            },
            { 
                upsert: true, 
                new: true, 
                runValidators: true,
                setDefaultsOnInsert: true 
            }
        );

        console.log(`Successfully synced user: ${member.user.username}`, updatedUser);
        return updatedUser;
    } catch (error) {
        console.error(`Error syncing user ${member.user.username}:`, error);
        throw error;
    }
}

// Function to sync all users
async function syncAllUsers() {
    try {
        // Get the first guild (server)
        const guild = client.guilds.cache.first();
        if (!guild) {
            throw new Error('No guild found');
        }

        console.log(`Found guild: ${guild.name}`);

        // Fetch all members with force refresh
        console.log('Fetching guild members...');
        const members = await guild.members.fetch({ force: true });
        console.log(`Found ${members.size} members`);

        // Clear existing users (optional, remove if you want to keep old users)
        // await User.deleteMany({});
        // console.log('Cleared existing users from database');

        // Sync each member
        let successCount = 0;
        let errorCount = 0;

        for (const [id, member] of members) {
            try {
                await syncUserData(member);
                successCount++;
                console.log(`Progress: ${successCount}/${members.size} members processed`);
            } catch (error) {
                errorCount++;
                console.error(`Failed to sync user ${member.user.username}:`, error);
            }
        }

        console.log(`Sync completed. Successfully synced ${successCount} members. Failed: ${errorCount}`);
    } catch (error) {
        console.error('Error during full sync:', error);
        throw error;
    }
}

// Auto sync every 5 minutes
function startAutoSync() {
    setInterval(async () => {
        console.log('Starting automatic sync...');
        try {
            await syncAllUsers();
            console.log('Automatic sync completed successfully');
        } catch (error) {
            console.error('Error during automatic sync:', error);
        }
    }, 5 * 60 * 1000); // 5 minutes
}

// Bot startup
client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        console.log('Starting initial sync...');
        await syncAllUsers();
        console.log('Initial sync completed successfully');
        startAutoSync();
    } catch (error) {
        console.error('Error during initial sync:', error);
    }
});

// Event handlers for real-time updates
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    console.log(`Member updated: ${newMember.user.username}`);
    if (oldMember.roles.cache.size !== newMember.roles.cache.size ||
        !oldMember.roles.cache.every(role => newMember.roles.cache.has(role.id))) {
        await syncUserData(newMember);
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    console.log(`New member joined: ${member.user.username}`);
    await syncUserData(member);
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login bot with error handling
console.log('Attempting to login to Discord...');
client.login(process.env.DISCORD_BOT_TOKEN)
    .then(() => console.log('Successfully logged in to Discord'))
    .catch(err => console.error('Bot login error:', err));

module.exports = client;