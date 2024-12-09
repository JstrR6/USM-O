const mongoose = require('mongoose');

const demotionSchema = new mongoose.Schema({
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    demotedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    previousRank: {
        type: String,
        required: true
    },
    demotionRank: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    processed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Demotion = mongoose.model('Demotion', demotionSchema);
module.exports = { Demotion };