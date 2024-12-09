const { Client, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const { User } = require('./models/user');
const { Promotion } = require('./models/promotion');

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
    return highestRank;
}

// Main function to sync a single user
async function syncUserData(member) {
  try {      
      // Create roles array with proper structure
      const roles = Array.from(member.roles.cache).map(([id, role]) => ({
          id: role.id,
          name: role.name
      }));

      // Calculate highest role and role flags
      const highestRole = determineHighestRole(roles);
      const roleFlags = determineRoleFlags(roles);

      // Create update object
      const updateData = {
          username: member.user.username,
          discordId: member.user.id,
          roles: roles,
          highestRole: highestRole,
          ...roleFlags  // Spread the role flags into the update
      };

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

// Function to determine role flags
function determineRoleFlags(roles) {
  const isRecruiter = roles.some(role => 
      ['Specialist', 'Corporal'].includes(role.name)
  );

  const isInstructor = roles.some(role => [
      'Sergeant', 'Staff Sergeant', 'Sergeant First Class', 'Master Sergeant',
      'First Sergeant', 'Sergeant Major', 'Command Sergeant Major', 
      'Sergeant Major of the Army', 'Second Lieutenant', 'First Lieutenant',
      'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General',
      'Major General', 'Lieutenant General', 'General', 'General of the Army'
  ].includes(role.name));

  const isSenior = roles.some(role => [
      'Master Sergeant', 'First Sergeant', 'Sergeant Major', 
      'Command Sergeant Major', 'Sergeant Major of the Army'
  ].includes(role.name));

  const isOfficer = roles.some(role => [
      'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
      'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General',
      'Lieutenant General', 'General', 'General of the Army'
  ].includes(role.name));

  return { isRecruiter, isInstructor, isSenior, isOfficer };
}

// Function to handle role updates for promotions
async function handlePromotion(userId, newRank) {
  try {
      const guild = client.guilds.cache.first();
      if (!guild) {
          throw new Error('No guild found');
      }

      const member = await guild.members.fetch(userId);
      if (!member) {
          throw new Error('Member not found');
      }

      // Define rank categories
      const rankCategories = {
          'Citizen': [],
          'Private': ['Enlisted', 'Enlisted Personnel'],
          'Private First Class': ['Enlisted', 'Enlisted Personnel'],
          'Specialist': ['Enlisted', 'Enlisted Personnel'],
          'Corporal': ['Enlisted', 'Enlisted Personnel'],
          'Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
          'Staff Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
          'Sergeant First Class': ['Non-Commissioned Officers', 'Enlisted Personnel'],
          'Master Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
          'First Sergeant': ['Non-Commissioned Officers', 'Enlisted Personnel'],
          'Sergeant Major': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
          'Command Sergeant Major': ['Senior Non-Commissioned Officers', 'Enlisted Personnel'],
          'Sergeant Major of the Army': ['Senior Non-Commissioned Officers', 'Enlisted Personnel']
      };

      // All categories to potentially remove
      const allCategories = [
          'Enlisted',
          'Non-Commissioned Officers',
          'Senior Non-Commissioned Officers',
          'Enlisted Personnel'
      ];

      // Remove current rank roles and categories
      const rolesToRemove = member.roles.cache.filter(role => 
          RANK_ORDER.includes(role.name) || allCategories.includes(role.name)
      );

      for (const [_, role] of rolesToRemove) {
          await member.roles.remove(role);
      }

      // Add new rank role
      const newRankRole = guild.roles.cache.find(role => role.name === newRank);
      if (newRankRole) {
          await member.roles.add(newRankRole);
      } else {
          throw new Error(`Rank role ${newRank} not found`);
      }

      // Add category roles
      const categoriesToAdd = rankCategories[newRank] || [];
      for (const category of categoriesToAdd) {
          const categoryRole = guild.roles.cache.find(role => role.name === category);
          if (categoryRole) {
              await member.roles.add(categoryRole);
          }
      }

      console.log(`Successfully promoted ${member.user.username} to ${newRank}`);
      return true;
  } catch (error) {
      console.error('Error handling promotion:', error);
      return false;
  }
}

// Function to check for pending promotions
async function checkPendingPromotions() {
  try {
      // Find all approved promotions that haven't been processed
      const pendingPromotions = await Promotion.find({
          status: 'approved',
          processed: { $ne: true }
      }).populate('targetUser');

      for (const promotion of pendingPromotions) {
          console.log(`Processing promotion for ${promotion.targetUser.username}`);
          
          const success = await handlePromotion(
              promotion.targetUser.discordId,
              promotion.promotionRank
          );

          if (success) {
              // Update user's rank in database
              await User.findByIdAndUpdate(promotion.targetUser._id, {
                  highestRole: promotion.promotionRank
              });

              // Mark promotion as processed
              promotion.processed = true;
              await promotion.save();

              console.log(`Completed promotion for ${promotion.targetUser.username}`);
          } else {
              console.error(`Failed to process promotion for ${promotion.targetUser.username}`);
          }
      }
  } catch (error) {
      console.error('Error checking pending promotions:', error);
  }
}

// Login bot
client.login(process.env.DISCORD_BOT_TOKEN)
    .catch(err => console.error('Bot login error:', err));

    module.exports = {
      client: client,
      handlePromotion: handlePromotion,
      RANK_ORDER: RANK_ORDER
  };