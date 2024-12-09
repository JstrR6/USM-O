const { Client, Events, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { User, ARMY_RANKS } = require('./models/user');

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Function to determine highest role from a list of roles
function determineHighestRole(roles) {
    let highestRankIndex = 0;
    roles.forEach(role => {
        const rankIndex = ARMY_RANKS.indexOf(role);
        if (rankIndex > highestRankIndex && rankIndex !== -1) {
            highestRankIndex = rankIndex;
        }
    });
    return ARMY_RANKS[highestRankIndex];
}

// Function to filter and get only army ranks from roles
function filterArmyRoles(roles) {
    return roles.filter(role => ARMY_RANKS.includes(role));
}

// Function to sync a single user
async function syncUser(member) {
    try {
        const roles = member.roles.cache.map(role => role.name);
        const armyRoles = filterArmyRoles(roles);
        const highestRole = determineHighestRole(armyRoles);

        const userData = {
            discordId: member.id,
            username: member.user.username,
            roles: roles,
            highestRole: highestRole
        };

        let user = await User.findOne({ discordId: member.id }).exec();

        if (!user) {
            console.log(`Creating new user: ${member.user.username}`);
            user = new User(userData);
        } else {
            console.log(`Updating existing user: ${member.user.username}`);
            Object.assign(user, userData);
        }

        user.updateFlags();
        await user.save();
        console.log(`Processed user ${member.user.username} with highest role: ${highestRole}`);

    } catch (error) {
        console.error(`Error syncing user ${member.user.username}:`, error.message);
        console.error(error);
    }
}

// Function to perform complete sync of all users
async function syncAllUsers() {
    try {
        console.log('Starting full user sync...');
        
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('No guild found');
            return;
        }

        const members = await guild.members.fetch();
        console.log(`Found ${members.size} members in Discord`);

        const dbUsers = await User.find({}).exec();
        console.log(`Found ${dbUsers.length} users in database`);

        const discordMemberIds = new Set(members.map(member => member.id));
        
        // Remove users that are no longer in the Discord
        for (const dbUser of dbUsers) {
            if (!discordMemberIds.has(dbUser.discordId)) {
                console.log(`Removing user ${dbUser.username} - no longer in Discord`);
                await User.findByIdAndDelete(dbUser._id);
            }
        }

        // Process each member
        for (const [id, member] of members) {
            await syncUser(member);
        }

        console.log('Full user sync completed successfully');
    } catch (error) {
        console.error('Error during full sync:', error);
    }
}

// Function to start auto-sync
function startAutoSync() {
    setInterval(syncAllUsers, 60000);
    console.log('Auto-sync started - will sync every minute');
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// Bot startup
client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    await syncAllUsers();
    startAutoSync();
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);