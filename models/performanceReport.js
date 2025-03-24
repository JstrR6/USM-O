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

  // XP Awards tracking
  xpAwards: [{
    xp: { type: Number, required: true },
    awardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
    reason: String
  }],
  
  // SNCO Review fields
  flag: {
    type: String,
    enum: ['red', 'yellow', 'blue', 'green', null],
    default: null
  },
  sncoRemarks: String,
  sncoReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoReviewDate: Date,
  
  // Officer Review fields
  officerComments: String,
  officerReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  officerReviewDate: Date,

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
  finalizedDate: Date,  // Date when report was finalized
  
  // Hold tracking
  previousStatus: String,  // To store status before Hold
  holdReason: String,      // Reason for putting report on hold
  heldBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Status / Meta
  status: { 
    type: String, 
    enum: ['Draft', 'Submitted', 'Reviewed', 'Finalized', 'Hold', 'Flagged'], 
    default: 'Draft' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware to automatically update timestamps and calculate score
performanceReportSchema.pre('save', function(next) {
  // Update the updatedAt timestamp
  this.updatedAt = Date.now();
  
  // Calculate score if not already set and performance metrics exist
  if (!this.calculatedScore) {
    const metrics = [
      this.communication,
      this.discipline,
      this.teamwork,
      this.leadershipPotential,
      this.technicalSkill
    ].filter(Boolean); // Filter out undefined/null values
    
    if (metrics.length > 0) {
      this.calculatedScore = metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
    }
  }
  
  // If red-flagged, automatically set status to "Flagged" unless on Hold
  if (this.flag === 'red' && this.status !== 'Hold') {
    this.status = 'Flagged';
  }
  
  next();
});

// Statics for querying by status
performanceReportSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('targetUser').populate('evaluator');
};

// Method to toggle hold status
performanceReportSchema.methods.toggleHold = function(reason, userId) {
  if (this.status === 'Hold') {
    // Remove hold and restore previous status
    this.status = this.previousStatus || 'Submitted';
    this.previousStatus = null;
    this.holdReason = null;
    this.heldBy = null;
  } else {
    // Put on hold
    this.previousStatus = this.status;
    this.status = 'Hold';
    this.holdReason = reason;
    this.heldBy = userId;
  }
  return this.save();
};

// Method to award XP
performanceReportSchema.methods.awardXP = async function(amount, awarderId, reason = 'Performance report award') {
  // Add to XP awards array
  this.xpAwards.push({
    xp: amount,
    awardedBy: awarderId,
    date: new Date(),
    reason
  });
  
  // Save the report
  await this.save();
  
  // Return the XP award info for possible User model update
  return {
    targetUser: this.targetUser,
    amount,
    awardedBy: awarderId,
    reason
  };
};

// Virtual for total awarded XP
performanceReportSchema.virtual('totalAwardedXP').get(function() {
  if (!this.xpAwards || !this.xpAwards.length) return 0;
  return this.xpAwards.reduce((sum, award) => sum + award.xp, 0);
});

// Create indexes for common queries
performanceReportSchema.index({ status: 1, createdAt: -1 });
performanceReportSchema.index({ targetUser: 1, createdAt: -1 });
performanceReportSchema.index({ flag: 1 });
performanceReportSchema.index({ division: 1 });

module.exports = mongoose.model('PerformanceReport', performanceReportSchema);