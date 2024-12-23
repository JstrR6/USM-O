const mongoose = require('mongoose');

const disciplinarySchema = new mongoose.Schema({
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    grade: {
        type: Number,  // 1: Warning, 2: Violation, 3: Violation II, 4: Demotion
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    xpDeduction: {
        type: Number,
        default: 0
    },
    demotionRank: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'completed'  // Will be 'pending' for Grade 3 & 4
    },
    officerApproval: {
        officer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        date: Date,
        notes: String
    },
    dateIssued: {
        type: Date,
        default: Date.now
    }
});

const DisciplinaryAction = mongoose.model('DisciplinaryAction', disciplinarySchema);
module.exports = { DisciplinaryAction };