const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const performanceReportSchema = new Schema({
  targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  division: { type: Schema.Types.ObjectId, ref: 'Division' },
  evaluator: { type: Schema.Types.ObjectId, ref: 'User' }, // Added for tracking who created the report

  // Evaluation Period
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },

  // Performance Sections (graded 1-5)
  dutyPerformance: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },
  discipline: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },
  communication: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },
  initiative: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },
  missionContribution: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },
  professionalism: {
    grade: { type: Number, min: 1, max: 5 },
    remarks: String
  },

  // Incident Log
  incidents: [{
    title: String,
    date: Date,
    description: String,
    type: { type: String, enum: ['Noteworthy', 'Needs Attention'] }
  }],

  // Summary
  strengths: String,
  weaknesses: String,
  remarks: String, // General remarks
  recommendations: {
    promotionRecommended: Boolean,
    additionalTraining: Boolean,
    disciplinaryWatch: Boolean
  },

  // XP Recommendation
  recommendedXP: { type: Number, default: 0 },

  // Auto Grade
  calculatedScore: Number, // Raw calculated score
  overallGrade: {
    type: String,
    enum: ['Excellent', 'Satisfactory', 'Needs Improvement', 'Unsatisfactory']
  },

  // SNCO Flag and Review
  flag: {
    type: String,
    enum: ['red', 'yellow', 'blue', 'green', null],
    default: null
  },
  sncoRemarks: String,
  sncoReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoReviewDate: Date,

  // Comments from various users
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