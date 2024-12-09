const mongoose = require('mongoose');

const ARMY_RANKS = [
    'Citizen',
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
    'General of the Army'
];

const roleSchema = new mongoose.Schema({
    id: String,
    name: String
});

const userSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    roles: [roleSchema],  
    highestRole: {
        type: String,
        default: 'Citizen'
    },
    xp: {
        type: Number,
        default: 0
    },
    password: {
        type: String,
        default: null
    },
    isRecruiter: {
        type: Boolean,
        default: false
    },
    isInstructor: {
        type: Boolean,
        default: false
    },
    isSenior: {
        type: Boolean,
        default: false
    },
    isOfficer: {
        type: Boolean,
        default: false
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Function to check if user has any of the specified roles
userSchema.methods.hasAnyRole = function(roleList) {
    return this.roles.some(role => roleList.includes(role));
};

// Function to determine highest role
userSchema.methods.determineHighestRole = function() {
    const userRoles = this.roles;
    let highestRankIndex = 0;
    
    userRoles.forEach(role => {
        const rankIndex = ARMY_RANKS.indexOf(role);
        if (rankIndex > highestRankIndex) {
            highestRankIndex = rankIndex;
        }
    });

    return ARMY_RANKS[highestRankIndex];
};

// Function to update user flags based on roles
userSchema.methods.updateFlags = function() {
    const recruiterRoles = ['Specialist', 'Corporal'];
    const instructorRoles = [
        'Sergeant', 'Staff Sergeant', 'Sergeant First Class', 'Master Sergeant',
        'First Sergeant', 'Sergeant Major', 'Command Sergeant Major', 
        'Sergeant Major of the Army', 'Second Lieutenant', 'First Lieutenant',
        'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General',
        'Major General', 'Lieutenant General', 'General', 'General of the Army'
    ];
    const seniorRoles = [
        'Master Sergeant', 'First Sergeant', 'Sergeant Major', 
        'Command Sergeant Major', 'Sergeant Major of the Army'
    ];
    const officerRoles = [
        'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
        'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General',
        'Lieutenant General', 'General', 'General of the Army'
    ];

    this.isRecruiter = this.hasAnyRole(recruiterRoles);
    this.isInstructor = this.hasAnyRole(instructorRoles);
    this.isSenior = this.hasAnyRole(seniorRoles);
    this.isOfficer = this.hasAnyRole(officerRoles);
    this.highestRole = this.determineHighestRole();
};

const User = mongoose.model('User', userSchema);
module.exports = { User, ARMY_RANKS };