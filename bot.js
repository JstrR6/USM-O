const { Client, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const { User } = require('./models/user');

// Define rank hierarchy (from lowest to highest)
const RANK_ORDER = [
    'Citizen',                    // Lowest rank
    'Private',
    'Private First Class',
    'Specialist',
    'Corporal',
    'Sergeant',
    'Staff Sergeant',
    'Sergeant First Class',
    'Master Sergeant',
    'First Sergeant',
    'Sergeant Major',
    'Command Sergeant Major',
    'Sergeant Major of the Army',
    'Second Lieutenant',
    'First Lieutenant',
    'Captain',
    'Major',
    'Lieutenant Colonel',
    'Colonel',
    'Brigadier General',
    'Major General',
    'Lieutenant General',
    'General',
    'General of the Army'         // Highest rank
];

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

// Function to determine highest role
function determineHighestRole(roles) {
    let highestRankIndex = -1;  // Start at -1 so any rank will be higher
    let highestRank = 'Citizen';

    // Filter role names that exist in our rank hierarchy
    const militaryRoles = roles.filter(role => RANK_ORDER.includes(role.name));
    
    if (militaryRoles.length > 0) {
        militaryRoles.forEach(role => {
            const rankIndex = RANK_ORDER.indexOf(role.name);
            if (rankIndex > highestRankIndex) {
                highestRankIndex = rankIndex;
                highestRank = role.name;
            }
        });
    }

    console.log(`User roles: ${militaryRoles.map(r => r.name).join(', ')}`);
    console.log(`Determined highest role: ${highestRank}`);
    return highestRank;
}

// Main function to sync a single user
async function syncUserData(member) {
    try {
        console.log(`Attempting to sync user: ${member.user.username}`);
        
        // Create roles array with proper structure
        const roles = Array.from(member.roles.cache).map(([id, role]) => ({
            id: role.id,
            name: role.name
        }));

        // Calculate highest role
        const highestRole = determineHighestRole(roles);

        // Create update object
        const updateData = {
            username: member.user.username,
            discordId: member.user.id,
            roles: roles,
            highestRole: highestRole
        };

        console.log('Update data:', {
            username: updateData.username,
            highestRole: updateData.highestRole,
            roleCount: updateData.roles.length
        });

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

        console.log(`Successfully synced user: ${member.user.username} with highest role: ${highestRole}`);
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