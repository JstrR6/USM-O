// Simplified Performance Report Schema
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const performanceReportSchema = new Schema({
  // Basic information
  targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  evaluator: { type: Schema.Types.ObjectId, ref: 'User' },
  division: { 
    type: Schema.Types.ObjectId, 
    ref: 'Division',
    required: false  // Make division optional
  },

  // Evaluation Period
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },

  // Performance Scores - Only these 5 direct fields
  communication: { type: Number, min: 1, max: 5 },
  discipline: { type: Number, min: 1, max: 5 },
  teamwork: { type: Number, min: 1, max: 5 },
  leadershipPotential: { type: Number, min: 1, max: 5 },
  technicalSkill: { type: Number, min: 1, max: 5 },
  
  // Calculated Score
  calculatedScore: Number,

  // Summary fields
  strengths: String,
  weaknesses: String,
  remarks: String,

  // Recommendations
  promotionRecommended: { type: Boolean, default: false },
  additionalTraining: { type: Boolean, default: false },
  disciplinaryWatch: { type: Boolean, default: false },
  
  // XP Recommendation
  recommendedXP: { type: Number, default: 0 },

  // SNCO Review fields
  flag: {
    type: String,
    enum: ['red', 'yellow', 'blue', 'green', null],
    default: null
  },
  sncoRemarks: String,
  sncoReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoReviewDate: Date,

  // Comments
  comments: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    date: { type: Date, default: Date.now }
  }],

  // Signatures
  ncoSignature: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoSignature: { type: Schema.Types.ObjectId, ref: 'User' },
  officerSignature: { type: Schema.Types.ObjectId, ref: 'User' },

  // Status / Meta
  status: { 
    type: String, 
    enum: ['Draft', 'Submitted', 'Reviewed', 'Finalized', 'Hold', 'Flagged'], 
    default: 'Draft' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PerformanceReport', performanceReportSchema);