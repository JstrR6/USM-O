const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const trainingSchema = new Schema({
  trainees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  traineeNamesRaw: String, // raw input for reference
  startTime: Date,
  endTime: Date,
  trainingEvent: String,
  overallGrade: { type: String, enum: ['Excellent', 'Satisfactory', 'Needs Improvement', 'Fail'] },
  outcome: { type: String, enum: ['Satisfactory', 'Remedial Training Advised', 'Training Failed'] },
  remedialTrainees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  failedTrainees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  sncoReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoRemarks: String,
  sncoXPRecommendation: Number,
  officerReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  xpApproved: [{ 
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    xp: Number
  }],
  status: {
    type: String,
    enum: ['Pending SNCO Review', 'Pending Officer Approval', 'Completed', 'HOLD'],
    default: 'Pending SNCO Review'
  },
  ncoSignature: { type: Schema.Types.ObjectId, ref: 'User' },
  sncoSignature: { type: Schema.Types.ObjectId, ref: 'User' },
  officerSignature: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Training', trainingSchema);
