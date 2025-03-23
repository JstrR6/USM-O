const mongoose = require('mongoose');

const recruitmentRequestSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    username: { type: String, required: true },
    discordUsername: { type: String, required: true },
    timezone: { type: String, required: true },
    careerInterest: { type: String, required: true },
    remarks: { type: String },
    hoursPerWeek: { type: Number },
    referredBy: { type: String },
    dateSubmitted: { type: Date, default: Date.now },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('RecruitmentRequest', recruitmentRequestSchema);
