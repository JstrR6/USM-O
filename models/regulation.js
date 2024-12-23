const mongoose = require('mongoose');

const regulationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    removedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    dateAdded: {
        type: Date,
        default: Date.now
    },
    dateRemoved: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    version: {
        type: Number,
        default: 1
    },
    lastModified: {
        type: Date
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    changeHistory: [{
        modifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        modifiedDate: {
            type: Date,
            default: Date.now
        },
        changeType: {
            type: String,
            enum: ['added', 'removed', 'modified'],
            required: true
        },
        previousContent: String,
        newContent: String,
        reason: String
    }]
});

const Regulation = mongoose.model('Regulation', regulationSchema);
module.exports = { Regulation };