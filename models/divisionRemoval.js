const mongoose = require('mongoose');

const divisionRemovalSchema = new mongoose.Schema({
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetDivision: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true },
  reason: String,
  context: String,
  sncoSignature: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  officerComments: String,
  officerSignature: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fieldDecision: { type: String, enum: ['Approved', 'Blocked'] },
  fieldNotes: String,
  fieldSignature: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['Pending Officer Review', 'Pending Field Officer Decision', 'Approved', 'Blocked'],
    default: 'Pending Officer Review'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DivisionRemoval', divisionRemovalSchema);
