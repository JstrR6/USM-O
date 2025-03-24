const mongoose = require('mongoose');

const promotionRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  currentRank: {
    type: String,
    required: true,
  },
  currentXP: {
    type: Number,
    required: true,
  },
  nextRank: {
    type: String,
    required: false, // Optional for slot-based promotions
  },
  nextXP: {
    type: Number,
    required: false, // Not required beyond First Sergeant
  },
  isSlotBased: {
    type: Boolean,
    default: false, // true if promotion is beyond First Sergeant
  },
  recommendation: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Denied', 'On Hold'],
    default: 'Pending',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  reviewRemarks: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PromotionRequest', promotionRequestSchema);
