const mongoose = require("mongoose");

const RANKS = [
    "Citizen",
    "Airman Basic",
    "Airman",
    "Airman First Class",
    "Senior Airman",
    "Staff Sergeant",
    "Technical Sergeant",
    "Master Sergeant",
    "First Sergeant",
    "Senior Master Sergeant",
    "Senior First Sergeant",
    "Chief Master Sergeant",
    "Chief First Sergeant",
    "Command Chief Master Sergeant",
    "Senior Enlisted Leader",
    "Chief Senior Enlisted Leader",
    "Chief Master Sergeant of the Air Force",
    "Second Lieutenant",
    "First Lieutenant",
    "Captain",
    "Major",
    "Lieutenant Colonel",
    "Colonel",
    "Brigadier General",
    "Major General",
    "Lieutenant General",
    "General",
    "General of the Air Force",
];

const roleSchema = new mongoose.Schema({
    id: String,
    name: String,
});

const userSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true,
    },
    robloxId: {
        type: String,
        default: null, // New field for Roblox ID
    },
    username: {
        type: String,
        required: true,
    },
    roles: [roleSchema],
    highestRole: {
        type: String,
        default: "Citizen",
    },
    xp: {
        type: Number,
        default: 0,
    },
    password: {
        type: String,
        default: null,
    },
    isRecruiter: {
        type: Boolean,
        default: false,
    },
    isInstructor: {
        type: Boolean,
        default: false,
    },
    isSenior: {
        type: Boolean,
        default: false,
    },
    isOfficer: {
        type: Boolean,
        default: false,
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
});

// Function to check if user has any of the specified roles
userSchema.methods.hasAnyRole = function (roleList) {
    return this.roles.some((role) => roleList.includes(role));
};

// Function to determine highest role
userSchema.methods.determineHighestRole = function () {
    const userRoles = this.roles;
    let highestRankIndex = 0;

    userRoles.forEach((role) => {
        const rankIndex = RANKS.indexOf(role);
        if (rankIndex > highestRankIndex) {
            highestRankIndex = rankIndex;
        }
    });

    return ARMY_RANKS[highestRankIndex];
};

// Function to update user flags based on roles
userSchema.methods.updateFlags = function () {
    const recruiterRoles = ["Senior Airman", "Staff Sergeant"];
    const instructorRoles = [
        "Staff Sergeant",
        "Technical Sergeant",
        "Master Sergeant",
        "First Sergeant",
        "Senior Master Sergeant",
        "Senior First Sergeant",
        "Chief Master Sergeant",
        "Chief First Sergeant",
        "Command Chief Master Sergeant",
        "Senior Enlisted Leader",
        "Chief Senior Enlisted Leader",
        "Chief Master Sergeant of the Air Force",
        "Second Lieutenant",
        "First Lieutenant",
        "Captain",
        "Major",
        "Lieutenant Colonel",
        "Colonel",
        "Brigadier General",
        "Major General",
        "Lieutenant General",
        "General",
        "General of the Air Force",
    ];
    const seniorRoles = [
        "Senior Master Sergeant",
        "Senior First Sergeant",
        "Chief Master Sergeant",
        "Chief First Sergeant",
        "Command Chief Master Sergeant",
        "Senior Enlisted Leader",
        "Chief Senior Enlisted Leader",
        "Chief Master Sergeant of the Air Force",
    ];
    const officerRoles = [
        "Second Lieutenant",
        "First Lieutenant",
        "Captain",
        "Major",
        "Lieutenant Colonel",
        "Colonel",
        "Brigadier General",
        "Major General",
        "Lieutenant General",
        "General",
        "General of the Air Force",
    ];

    this.isRecruiter = this.hasAnyRole(recruiterRoles);
    this.isInstructor = this.hasAnyRole(instructorRoles);
    this.isSenior = this.hasAnyRole(seniorRoles);
    this.isOfficer = this.hasAnyRole(officerRoles);
    this.highestRole = this.determineHighestRole();
};

const User = mongoose.model("User", userSchema);
module.exports = { User, RANKS };
