const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    parentDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division',
        default: null,
    },
    personnel: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        position: {
            type: String,
            enum: [
                'Commander',
                'Deputy Commander',
                'Senior Enlisted Leader',
                'Section Chief',
                'Non-Commission Officer In Charge',
                'Squadron Sergeant',
                'Squadron Leader',
                'Airman'
            ],
            required: true
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Division', divisionSchema);