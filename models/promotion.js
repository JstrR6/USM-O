const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    promotedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentRank: {
        type: String,
        required: true
    },
    promotionRank: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    needsOfficerApproval: {
        type: Boolean,
        default: false
    },
    officerApproval: {
        officer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        date: Date,
        rejectReason: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    processed: {
        type: Boolean,
        default: false
    }
});

const Promotion = mongoose.model('Promotion', promotionSchema);
module.exports = { Promotion };