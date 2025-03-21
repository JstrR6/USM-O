const mongoose = require('mongoose');
const { User } = require('./models/user');
const { Promotion } = require('./models/promotion');
const { Demotion } = require('./models/demotion');  
const express = require('express');
const axios = require("axios");
const router = express.Router();
const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');

// Define rank hierarchy (from lowest to highest)
const RANK_ORDER = [
    'Citizen',
    'Airman Basic',
    'Airman',
    'Airman First Class',
    'Senior Airman',
    'Staff Sergeant',
    'Technical Sergeant',
    'Master Sergeant',
    'First Sergeant',
    'Senior Master Sergeant',
    'Senior First Sergeant',
    'Chief Master Sergeant',
    'Chief First Sergeant',
    'Command Chief Master Sergeant',
    'Senior Enlisted Leader',
    'Chief Senior Enlisted Leader',
    'Chief Master Sergeant of the Air Force',
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
    'General of the Air Force'
];

// Connect to MongoDB with error handling
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// XP rank mapping constant
const XP_RANKS = [
    { xp: 0, rank: 'Citizen' },
    { xp: 1, rank: 'Airman Basic' },
    { xp: 10, rank: 'Airman' },
    { xp: 25, rank: 'Airman First Class' },
    { xp: 50, rank: 'Senior Airman' },
    { xp: 100, rank: 'Staff Sergeant' },
    { xp: 175, rank: 'Technical Sergeant' },
    { xp: 300, rank: 'Master Sergeant' },
    { xp: 500, rank: 'First Sergeant' },
].sort((a, b) => b.xp - a.xp); // Sort by XP descending

const OFFICER_RANKS = [
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
    'General of the Air Force'
];

// Function to log rank changes
async function logRankChange(user, newRank, oldRank) {
    try {
        const oldRankIndex = RANK_ORDER.indexOf(oldRank);
        const newRankIndex = RANK_ORDER.indexOf(newRank);
        const isPromotion = newRankIndex > oldRankIndex;

        // Check for existing log within the last minute to prevent duplicates
        const oneMinuteAgo = new Date(Date.now() - 60000); // 1 minute ago

        if (isPromotion) {
            // Check for recent promotion with same details
            const existingPromotion = await Promotion.findOne({
                targetUser: user._id,
                currentRank: oldRank,
                promotionRank: newRank,
                createdAt: { $gte: oneMinuteAgo }
            });

            if (!existingPromotion) {
                const promotion = new Promotion({
                    targetUser: user._id,
                    promotedBy: user._id,
                    currentRank: oldRank,
                    promotionRank: newRank,
                    reason: `Automatic promotion due to XP threshold (${user.xp} XP)`,
                    status: 'approved',
                    needsOfficerApproval: false,
                    processed: true,
                    officerApproval: {
                        officer: user._id,
                        date: new Date()
                    }
                });
                await promotion.save();
                console.log(`Logged promotion for ${user.username}: ${oldRank} -> ${newRank}`);
            } else {
                console.log(`Skipping duplicate promotion log for ${user.username}`);
            }
        } else {
            // Check for recent demotion with same details
            const existingDemotion = await Demotion.findOne({
                targetUser: user._id,
                previousRank: oldRank,
                demotionRank: newRank,
                createdAt: { $gte: oneMinuteAgo }
            });

            if (!existingDemotion) {
                const demotion = new Demotion({
                    targetUser: user._id,
                    demotedBy: user._id,
                    previousRank: oldRank,
                    demotionRank: newRank,
                    reason: `Automatic demotion due to XP threshold (${user.xp} XP)`,
                    processed: true
                });
                await demotion.save();
                console.log(`Logged demotion for ${user.username}: ${oldRank} -> ${newRank}`);
            } else {
                console.log(`Skipping duplicate demotion log for ${user.username}`);
            }
        }
    } catch (error) {
        console.error('Error logging rank change:', error);
        throw error;
    }
}

// Function to determine rank based on XP
function determineRankFromXP(xp) {
    for (const rankData of XP_RANKS) {
        if (xp >= rankData.xp) {
            return rankData.rank;
        }
    }
    return 'Citizen';
}

// Function to determine highest role
function determineHighestRole(roles) {
    let highestRankIndex = -1;
    let highestRank = 'Citizen';

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
    return highestRank;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
});

// Register slash commands on startup
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your Roblox account to your Discord account')
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered.');
    } catch (err) {
        console.error('❌ Error registering commands:', err);
    }
});

// Handle `/link` command
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'link') return;

    try {
        // Defer reply to avoid timeout
        await interaction.deferReply({ ephemeral: true });

        // Avoid hitting rate limits by reusing DM channel
        const dmChannel = interaction.user.dmChannel ?? await interaction.user.createDM();
        await dmChannel.send("👋 Please reply with your **Roblox username** to link it to your Discord account.");
        await interaction.editReply({ content: "📩 Check your DMs to continue the linking process." });

        const collected = await dmChannel.awaitMessages({
            filter: msg => msg.author.id === interaction.user.id,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const robloxUsername = collected.first().content;

        // Fetch Roblox ID
        const response = await axios.post("https://users.roblox.com/v1/usernames/users", {
            usernames: [robloxUsername],
            excludeBannedUsers: false
        });

        if (!response.data.data.length) {
            return dmChannel.send("❌ Roblox username not found.");
        }

        const robloxId = response.data.data[0].id;

        // Save or update user in MongoDB
        let user = await User.findOne({ discordId: interaction.user.id });
        if (user) {
            user.robloxId = robloxId;
        } else {
            user = new User({
                discordId: interaction.user.id,
                username: interaction.user.username,
                robloxId: robloxId
            });
        }

        await user.save();
        await dmChannel.send(`✅ Your Roblox account **${robloxUsername}** (ID: ${robloxId}) has been linked.`);

    } catch (err) {
        console.error('❌ Error in /link command:', err);
        try {
            await interaction.editReply({ content: "❌ An error occurred while linking your Roblox account." });
        } catch {}
    }
});

// Error logging
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// Function to determine role flags
function determineRoleFlags(roles) {
    // First, get the actual highest role from all roles, including officer ranks
    const highestRole = roles.reduce((highest, role) => {
        const currentIndex = RANK_ORDER.indexOf(role.name);
        const highestIndex = RANK_ORDER.indexOf(highest);
        return currentIndex > highestIndex ? role.name : highest;
    }, 'Citizen');

    const rankIndex = RANK_ORDER.indexOf(highestRole);
    
    const flags = {
        isRecruiter: false,
        isInstructor: false,
        isSenior: false,
        isOfficer: false
    };
    
    if (rankIndex >= RANK_ORDER.indexOf('Specialist')) {
        flags.isRecruiter = true;
    }
    
    if (rankIndex >= RANK_ORDER.indexOf('Sergeant')) {
        flags.isInstructor = true;
        flags.isRecruiter = true;
    }
    
    if (rankIndex >= RANK_ORDER.indexOf('Master Sergeant')) {
        flags.isSenior = true;
        flags.isInstructor = true;
        flags.isRecruiter = true;
    }
    
    // Fix: Check full RANK_ORDER for officer status
    if (rankIndex >= RANK_ORDER.indexOf('Second Lieutenant')) {
        flags.isOfficer = true;
        flags.isInstructor = true;  // Officers should also be instructors
        flags.isRecruiter = true;   // Officers should also be recruiters
        flags.isSenior = true;      // Officers should also be senior
    }
    
    return flags;
}

// Function to handle role updates
async function handlePromotion(userId, newRank) {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error('No guild found');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Member not found');

        // Define rank categories
        const rankCategories = {
            'Citizen': [],
            'Airman Basic': ['Enlisted', 'Enlisted Personnel'],
            'Airman': ['Enlisted', 'Enlisted Personnel'],
            'Airman First Class': ['Enlisted', 'Enlisted Personnel'],
            'Senior Airman': ['Enlisted', 'Enlisted Personnel'],
            'Staff Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'Technical Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'Master Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'First Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'Senior Master Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'Senior First Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
            'Chief Master Sergeant': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Chief First Sergeant': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Command Chief Master Sergeant': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Senior Enlisted Leader': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Chief Senior Enlisted Leader': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Chief Master Sergeant of the Air Force': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
            'Second Lieutenant': ['Commissioned Officers', 'Company Grade Officers'],
            'First Lieutenant': ['Commissioned Officers', 'Company Grade Officers'],
            'Captain': ['Commissioned Officers', 'Company Grade Officers'],
            'Major': ['Commissioned Officers', 'Field Grade Officers'],
            'Lieutenant Colonel': ['Commissioned Officers', 'Field Grade Officers'],
            'Colonel': ['Commissioned Officers', 'Field Grade Officers'],
            'Brigadier General': ['Commissioned Officers', 'General Grade Officers'],
            'Major General': ['Commissioned Officers', 'General Grade Officers'],
            'Lieutenant General': ['Commissioned Officers', 'General Grade Officers'],
            'General': ['Commissioned Officers', 'General Grade Officers'],
            'General of the Air Force': ['Commissioned Officers', 'General Grade Officers']
        };

        // Remove current roles
        const allCategories = [
            'Enlisted',
            'Non-Commissioned Officers',
            'Senior Non-Commissioned Officers',
            'Enlisted Personnel',
            'Commissioned Officers',
            'Company Grade Officers',
            'Field Grade Officers',
            'General Grade Officers'
        ];

        const rolesToRemove = member.roles.cache.filter(role => 
            RANK_ORDER.includes(role.name) || allCategories.includes(role.name)
        );

        for (const [_, role] of rolesToRemove) {
            await member.roles.remove(role);
        }

        // Add new rank role
        const newRankRole = guild.roles.cache.find(role => role.name === newRank);
        if (!newRankRole) throw new Error(`Rank role ${newRank} not found`);
        await member.roles.add(newRankRole);

        // Add category roles
        const categoriesToAdd = rankCategories[newRank] || [];
        for (const category of categoriesToAdd) {
            const categoryRole = guild.roles.cache.find(role => role.name === category);
            if (categoryRole) {
                await member.roles.add(categoryRole);
            }
        }

        console.log(`Successfully updated roles for ${member.user.username} to ${newRank}`);
        return true;
    } catch (error) {
        console.error('Error handling promotion:', error);
        return false;
    }
}

// Function to sync user data
async function syncUserData(member) {
    try {
        const roles = Array.from(member.roles.cache).map(([id, role]) => ({
            id: role.id,
            name: role.name
        }));

        let user = await User.findOne({ discordId: member.user.id });
        let currentXP = user ? user.xp || 0 : 0;
        let highestRole = determineHighestRole(roles);
        const currentRank = highestRole;

        // Only update rank based on XP if the member is not an officer 
        // AND their current rank is within the XP-based range (up to "First Sergeant")
        if (!OFFICER_RANKS.includes(highestRole) &&
            RANK_ORDER.indexOf(highestRole) <= RANK_ORDER.indexOf('First Sergeant')) {
            
            const xpBasedRank = determineRankFromXP(currentXP);
            
            if (xpBasedRank !== highestRole) {
                console.log(`XP-based rank change detected for ${member.user.username}: ${highestRole} -> ${xpBasedRank}`);
                const success = await handlePromotion(member.user.id, xpBasedRank);
                
                if (success) {
                    if (user) {
                        await logRankChange(user, xpBasedRank, currentRank);
                    }
                    
                    highestRole = xpBasedRank;
                    roles.length = 0;
                    roles.push(...Array.from(member.roles.cache).map(([id, role]) => ({
                        id: role.id,
                        name: role.name
                    })));
                }
            }
        }

        // Adjust XP if the user's current rank is within the XP-based range and their XP is below the threshold.
        const xpMappingForRank = XP_RANKS.find(r => r.rank === highestRole);
        let updatedXP = currentXP;
        if (xpMappingForRank) {
            if (currentXP < xpMappingForRank.xp) {
                console.log(`Adjusting XP for ${member.user.username} from ${currentXP} to ${xpMappingForRank.xp} to match rank ${highestRole}`);
                updatedXP = xpMappingForRank.xp;
            }
        }

        const roleFlags = determineRoleFlags(roles);
        
        const updateData = {
            username: member.user.username,
            discordId: member.user.id,
            roles: roles,
            highestRole: highestRole,
            ...roleFlags,
            xp: updatedXP,
            lastUpdated: new Date()
        };

        // If user does not exist, initialize XP appropriately.
        if (!user) {
            updateData.xp = xpMappingForRank ? xpMappingForRank.xp : 0;
        }

        user = await User.findOneAndUpdate(
            { discordId: member.user.id },
            { $set: updateData },
            { 
                upsert: true, 
                new: true,
                runValidators: true 
            }
        );

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
        if (!guild) throw new Error('No guild found');

        console.log(`Starting sync for guild: ${guild.name}`);
        const members = await guild.members.fetch({ force: true });

        let successCount = 0;
        let errorCount = 0;

        for (const [id, member] of members) {
            try {
                await syncUserData(member);
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`Failed to sync user ${member.user.username}`);
            }
        }

        console.log(`Sync complete - Success: ${successCount}, Errors: ${errorCount}`);
    } catch (error) {
        console.error('Error during full sync:', error);
        throw error;
    }
}

// Auto sync timer
function startAutoSync() {
    setInterval(async () => {
        console.log('Starting automatic sync...');
        try {
            await syncAllUsers();
        } catch (error) {
            console.error('Error during automatic sync:', error);
        }
    }, 5 * 60 * 1000); // Every 5 minutes
}

// Event handlers
client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        await syncAllUsers();
        startAutoSync();
    } catch (error) {
        console.error('Error during initial sync:', error);
    }
});

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

module.exports = {
    client,
    handlePromotion,
    RANK_ORDER,
    XP_RANKS,
    OFFICER_RANKS,
    determineRankFromXP,
    syncUserData,
    syncAllUsers
};