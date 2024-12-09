const { Client, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const { User } = require('./models/user');

// Configure bot with necessary intents
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

// Main function to sync a single user
async function syncUserData(member) {
    try {
        console.log(`Attempting to sync user: ${member.user.username}`);
        
        // Create roles array with proper structure
        const roles = Array.from(member.roles.cache).map(([id, role]) => ({
            id: role.id,
            name: role.name
        }));

        // Create update object
        const updateData = {
            username: member.user.username,
            discordId: member.user.id,
            roles: roles
        };

        console.log('Update data:', updateData);

        // Use findOneAndUpdate
        const user = await User.findOneAndUpdate(
            { discordId: member.user.id },
            { $set: updateData },
            { 
                upsert: true, 
                new: true,
                runValidators: true 
            }
        );

        console.log(`Successfully synced user: ${member.user.username}`);
        return user;
    } catch (error) {
        console.error(`Error syncing user ${member.user.username}:`, error);
        throw error;
    }
}

// Function to sync all users
async function syncAllUsers() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            throw new Error('No guild found');
        }

        console.log(`Found guild: ${guild.name}`);
        const members = await guild.members.fetch({ force: true });
        console.log(`Found ${members.size} members`);

        let successCount = 0;
        let errorCount = 0;

        for (const [id, member] of members) {
            try {
                await syncUserData(member);
                successCount++;
                console.log(`Progress: ${successCount}/${members.size} members processed`);
            } catch (error) {
                errorCount++;
                console.error(`Failed to sync user ${member.user.username}`);
            }
        }

        console.log(`Sync completed. Success: ${successCount}, Failed: ${errorCount}`);
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
        } catch (error) {
            console.error('Error during automatic sync:', error);
        }
    }, 5 * 60 * 1000);
}

// Bot startup
client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        await syncAllUsers();
        startAutoSync();
    } catch (error) {
        console.error('Error during initial sync:', error);
    }
});

// Event handlers for real-time updates
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size ||
        !oldMember.roles.cache.every(role => newMember.roles.cache.has(role.id))) {
        await syncUserData(newMember);
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    await syncUserData(member);
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login bot
client.login(process.env.DISCORD_BOT_TOKEN)
    .catch(err => console.error('Bot login error:', err));

module.exports = client;