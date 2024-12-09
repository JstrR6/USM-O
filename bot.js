const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { User, ARMY_RANKS } = require('./models/user');

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// Function to determine highest role from a list of roles
function determineHighestRole(roles) {
    let highestRankIndex = 0;
    
    roles.forEach(role => {
        const rankIndex = ARMY_RANKS.indexOf(role);
        if (rankIndex > highestRankIndex) {
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

        const existingUser = await User.findOne({ discordId: member.id });

        if (!existingUser) {
            console.log(`Creating new user: ${member.user.username}`);
            const newUser = new User({
                discordId: member.id,
                username: member.user.username,
                roles: roles,
                highestRole: highestRole
            });
            newUser.updateFlags();
            await newUser.save();
            console.log(`Created user ${member.user.username} with highest role: ${highestRole}`);
        } else {
            console.log(`Updating existing user: ${member.user.username}`);
            existingUser.username = member.user.username;
            existingUser.roles = roles;
            existingUser.highestRole = highestRole;
            existingUser.updateFlags();
            await existingUser.save();
            console.log(`Updated user ${member.user.username} with highest role: ${highestRole}`);
        }
    } catch (error) {
        console.error(`Error syncing user ${member.user.username}:`, error);
    }
}

// Function to perform complete sync of all users
async function syncAllUsers() {
    try {
        console.log('Starting full user sync...');
        
        // Get all guild members
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('No guild found');
            return;
        }

        const members = await guild.members.fetch();
        console.log(`Found ${members.size} members in Discord`);

        // Get all users in database
        const dbUsers = await User.find({});
        console.log(`Found ${dbUsers.length} users in database`);

        // Create Set of Discord IDs for quick lookup
        const discordMemberIds = new Set(members.map(member => member.id));
        
        // Remove users that are no longer in the Discord
        for (const dbUser of dbUsers) {
            if (!discordMemberIds.has(dbUser.discordId)) {
                console.log(`Removing user ${dbUser.username} - no longer in Discord`);
                await User.findByIdAndDelete(dbUser._id);
            }
        }

        // Update or create users
        const syncPromises = members.map(member => syncUser(member));
        await Promise.all(syncPromises);

        console.log('Full user sync completed successfully');
    } catch (error) {
        console.error('Error during full sync:', error);
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Perform initial sync
    await syncAllUsers();
    
    // Set up interval for regular syncs
    setInterval(syncAllUsers, 60000); // Sync every minute
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});