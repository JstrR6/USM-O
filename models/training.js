const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema({
    trainees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['Basic Training', 'Training', 'Event', 'Raid'],
        required: true
    },
    xpAmount: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'bumped_up', 'bumped_back'],
        default: 'pending'
    },
    needsApproval: {
        type: Boolean,
        default: false
    },
    approvalChain: [{
        approver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        action: {
            type: String,
            enum: ['approve', 'reject', 'bump_up', 'bump_back']
        },
        reason: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    rejectReason: String,
    processed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Training = mongoose.model('Training', trainingSchema);
module.exports = { Training };