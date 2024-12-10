const mongoose = require('mongoose');

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

const divisionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    parentDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division',
        default: null, // Null for top-level divisions
    },
    personnel: [personnelSchema], // Embedded personnel schema
}, {
    timestamps: true,
});

const Division = mongoose.model('Division', divisionSchema);

module.exports = Division;
