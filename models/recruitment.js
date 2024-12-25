const mongoose = require('mongoose');

const RecruitmentSchema = new mongoose.Schema({
    recruitUsername: {
        type: String,
        required: true
    },
    recruitDiscord: {
        type: String,
        required: true
    },
    recruitRank: {
        type: String,
        required: true
    },
    dateSubmitted: {
        type: Date,
        default: Date.now
    },
    recruiter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division',
        required: true
    },
    finalDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division'
    },
    divisionPosition: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'bumped_up', 'bumped_back', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewChain: [{
        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        action: {
            type: String,
            enum: ['approve', 'bump_up', 'bump_back', 'reject'],
            required: true
        },
        notes: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    processed: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Recruitment', RecruitmentSchema);