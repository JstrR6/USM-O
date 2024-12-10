const mongoose = require('mongoose');

// Define personnel schema
const personnelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    rank: {
        type: String,
        enum: [
            'Soldier',
            'Squadron Leader',
            'Squadron Sergeant',
            'Non-Commission Officer In Charge',
            'Section Chief',
            'Senior Enlisted Leader',
            'Deputy Commander',
            'Commander',
        ],
        required: true,
    },
});

// Define division schema
const divisionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    parentDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division', // Reference to another Division
        default: null, // Null for top-level divisions
    },
    personnel: [personnelSchema], // Embedded personnel schema
}, {
    timestamps: true, // Adds createdAt and updatedAt fields
});

// Create the Division model
const Division = mongoose.model('Division', divisionSchema);

module.exports = Division;
