// models/recruitment.js
const mongoose = require('mongoose');

const recruitmentSchema = new mongoose.Schema({
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
    targetDivision: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division',
        required: true
    },
    divisionPosition: {
        type: String,
        required: true,
        enum: [
            'Commander',
            'Deputy Commander',
            'Senior Enlisted Leader',
            'Section Chief',
            'Non-Commission Officer In Charge',
            'Squadron Sergeant',
            'Squadron Leader',
            'Soldier'
        ]
    },
    dateRecruited: {
        type: Date,
        required: true
    },
    recruiter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'rejected_appealed', 'veto_approved', 'final_rejected'],
        default: 'pending'
    },
    sncoReviewNotes: String,
    officerReviewNotes: String,
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    appealReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Recruitment', recruitmentSchema);