const express = require('express');
const axios = require('axios');
const router = express.Router();
const bcrypt = require('bcrypt');
const passport = require('passport');
const { User } = require('./models/user');
const { Promotion } = require('./models/promotion');
const { Demotion } = require('./models/demotion');
const Recruitment = require('./models/recruitment');
const { Regulation } = require('./models/regulation');
const { DisciplinaryAction } = require('./models/disciplinary');
const { handlePromotion } = require('./bot')
const mongoose = require('mongoose');

const RecruitmentRequest = require('./models/recruitmentrequest');
const Division = require('./models/division');
const DivisionRemoval = require('./models/divisionRemoval');
const Training = require('./models/training');
const PerformanceReport = require('./models/performanceReport');
const PromotionRequest = require('./models/promotionRequest');

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Basic routes
router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

router.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('login', { title: 'Login' });
});

router.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).send('Access denied: Username not found.');
        }
        if (!user.password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
            await user.save();
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).send('Access denied: Incorrect password.');
        }
        req.login(user, (err) => {
            if (err) return next(err);
            return res.redirect('/dashboard');
        });
    } catch (err) {
        console.error('Login error:', err);
        return next(err);
    }
});

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/login');
    });
});

// Dashboard routes
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).exec();
        const allUsers = await User.find({}).sort({ highestRole: -1 }).exec();
        
        res.render('dashboard', {
            title: 'Dashboard',
            user: user,
            allUsers: allUsers,
            path: req.path
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Profile route
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
      const userId = req.user._id;
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).send('User not found');
      }

      const divisions = await Division.find({ 'personnel.user': userId });
      const performanceReports = await PerformanceReport.find({ targetUser: userId }).populate('evaluator');
      const approvedPromotionRequests = await PromotionRequest.find({
          targetUserId: userId,
          status: 'Approved'
      });
      const trainings = await Training.find({ attendees: userId }); // Assuming attendees is an array of user IDs

      res.render('profile', {
          user: user,
          divisions: divisions,
          performanceReports: performanceReports,
          approvedPromotionRequests: approvedPromotionRequests,
          trainings: trainings,
      });
  } catch (error) {
      console.error('Profile error:', error);
      res.status(500).send('Internal server error');
  }
});

// Members route
router.get('/members', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ highestRole: -1, xp: -1 })
            .select('username highestRole xp dateJoined')
            .exec();

        res.render('members', {
            title: 'Members',
            users: users,
            currentUser: req.user,
            path: req.path
        });
    } catch (error) {
        console.error('Members error:', error);
        res.status(500).send('Error loading members');
    }
});

// API endpoint for filtered members
router.get('/api/members/filter', isAuthenticated, async (req, res) => {
    try {
        const { rank, sort, direction, search } = req.query;
        let query = {};

        // Handle rank filtering
        if (rank && rank !== 'all') {
            if (rank === 'enlisted') {
                query.highestRole = { $in: ['Airman', 'Airman First Class', 'Senior Airman'] };
            } else if (rank === 'nco') {
                query.highestRole = {
                    $in: [
                        'Staff Sergeant', 'Technical Sergeant', 'Master Sergeant', 'First Sergeant', 'Senior Master Sergeant', 
                        'Senior First Sergeant'
                    ]
                };
            } else if (rank === 'snco') {
                query.highestRole = {
                    $in: [
                        'Chief Master Sergeant', 'Chief First Sergeant', 'Command Chief Master Sergeant', 'Senior Enlisted Leader', 
                        'Chief Senior Enlisted Leader', 'Chief Master Sergeant of the Air Force'
                    ]
                };
            } else if (rank === 'officer') {
                query.highestRole = {
                    $in: [
                        'Second Lieutenant', 'First Lieutenant', 
                        'Captain', 'Major', 'Lieutenant Colonel', 
                        'Colonel', 'Brigadier General', 'Major General', 
                        'Lieutenant General', 'General', 'General of the Air Force'
                    ]
                };
            } else {
                // Specific rank filter
                query.highestRole = rank;
            }
        }

        // Handle search
        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }

        // Handle sorting
        let sortOption = {};
        const sortDirection = direction === 'asc' ? 1 : -1;

        switch (sort) {
            case 'rank':
                sortOption = { highestRole: sortDirection, xp: sortDirection };
                break;
            case 'xp':
                sortOption = { xp: sortDirection, highestRole: sortDirection };
                break;
            case 'username':
                sortOption = { username: sortDirection };
                break;
            case 'joinDate':
                sortOption = { dateJoined: sortDirection };
                break;
            default:
                sortOption = { highestRole: -1, xp: -1 };
        }

        const users = await User.find(query)
            .sort(sortOption)
            .select('username highestRole xp dateJoined')
            .exec();

        res.json({ users });
    } catch (error) {
        console.error('Filter error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get member profile details
router.get('/api/members/:id/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('username highestRole xp dateJoined');

        if (!user) {
            return res.status(404).json({ error: 'Member not found' });
        }

        // Get user's current division
        const division = await Division.findOne({ 'personnel.user': user._id });
        const currentDivision = division ? {
            name: division.name,
            position: division.personnel?.find(p => p.user.toString() === user._id.toString())?.position || 'None'
        } : null;

        // Get all promotions and demotions
        const [promotions, demotions] = await Promise.all([
            Promotion.find({ targetUser: user._id })
                .sort({ createdAt: -1 })
                .populate('promotedBy', 'username')
                .populate('officerApproval.officer', 'username'),
            Demotion.find({ targetUser: user._id })
                .sort({ createdAt: -1 })
                .populate('demotedBy', 'username')
        ]);

        // Get all trainings
        const trainings = await Training.find({
            $or: [
                { instructor: user._id },
                { trainees: user._id }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('instructor', 'username')
        .populate('trainees', 'username')
        .populate('approvalChain.approver', 'username');

        // Get disciplinary actions
        const disciplinaryActions = await DisciplinaryAction.find({ targetUser: user._id })
            .sort({ dateIssued: -1 })
            .populate('issuedBy', 'username')
            .populate('officerApproval.officer', 'username');

        res.json({
            _id: user._id,
            username: user.username,
            highestRole: user.highestRole,
            xp: user.xp,
            dateJoined: user.dateJoined,
            division: currentDivision,
            trainings,
            promotions,
            demotions,
            disciplinaryActions
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/forms', async (req, res) => {
    try {
      const divisions = await Division.find({}, 'name').lean();
      const users = await User.find({}).lean();
  
      const form122OfficerQueue = await DivisionRemoval.find({ status: 'Pending Officer Review' })
        .populate('targetUser targetDivision sncoSignature')
        .lean();
  
      const formattedOfficerQueue = form122OfficerQueue.map(form => ({
        _id: form._id,
        targetUsername: form.targetUser?.username || 'Unknown',
        divisionName: form.targetDivision?.name || 'Unknown',
        reason: form.reason || '',
        sncoSignature: form.sncoSignature?.username || 'Unknown',
      }));
  
      const form150SncoQueue = await Training.find({ status: 'Pending SNCO Review' })
        .populate('ncoSignature')
        .lean();
  
      const form150OfficerQueue = await Training.find({ status: 'Pending Officer Approval' })
        .populate('ncoSignature sncoSignature')
        .lean();
  
      res.render('forms', {
        title: 'Forms',
        user: req.user || {}, // ← ensure user is always defined
        path: '/forms',
        divisions,
        users,
        form122OfficerQueue: formattedOfficerQueue,
        form150SncoQueue,
        form150OfficerQueue,
      });
    } catch (err) {
      console.error('Error loading forms:', err);
      res.status(500).send('Error loading forms');
    }
  });

// API Routes for Promotions
router.get('/api/users/check', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.query.username });
        if (user) {
            console.log('Found user:', {
                _id: user._id,
                username: user.username,
                highestRole: user.highestRole
            });
            res.json({ 
                user: {
                    _id: user._id,
                    username: user.username,
                    highestRole: user.highestRole
                }
            });
        } else {
            res.json({ user: null });
        }
    } catch (error) {
        console.error('Error checking user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/api/promotions', isAuthenticated, async (req, res) => {
    try {
        const { userId, promotionRank, reason } = req.body;
        const targetUser = await User.findById(userId);
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const needsOfficerApproval = [
            'Master Sergeant', 'First Sergeant', 'Sergeant Major', 
            'Command Sergeant Major', 'Sergeant Major of the Army'
        ].includes(promotionRank);

        const promotion = new Promotion({
            targetUser: userId,
            promotedBy: req.user._id,
            currentRank: targetUser.highestRole,
            promotionRank,
            reason,
            needsOfficerApproval,
            status: needsOfficerApproval ? 'pending' : 'approved'
        });

        await promotion.save();

        if (!needsOfficerApproval) {
            const success = await handlePromotion(targetUser.discordId, promotionRank);
            
            if (success) {
                targetUser.highestRole = promotionRank;
                await targetUser.save();
            } else {
                return res.status(500).json({ error: 'Failed to update Discord roles' });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Promotion error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update the approve route similarly
router.post('/api/promotions/:id/approve', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const promotion = await Promotion.findById(req.params.id).populate('targetUser');
        if (!promotion) {
            return res.status(404).json({ error: 'Promotion not found' });
        }

        const success = await handlePromotion(promotion.targetUser.discordId, promotion.promotionRank);
        
        if (success) {
            promotion.status = 'approved';
            promotion.officerApproval = {
                officer: req.user._id,
                date: new Date()
            };
            await promotion.save();

            await User.findByIdAndUpdate(promotion.targetUser._id, {
                highestRole: promotion.promotionRank
            });

            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to update Discord roles' });
        }
    } catch (error) {
        console.error('Approval error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending promotions (for officers)
router.get('/api/promotions/pending', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const pendingPromotions = await Promotion.find({ 
            needsOfficerApproval: true, 
            status: 'pending' 
        }).populate('targetUser promotedBy');
        
        res.json({ promotions: pendingPromotions });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/api/promotions/logs', isAuthenticated, async (req, res) => {
    try {
        const promotions = await Promotion.find({})
            .populate('targetUser promotedBy')
            .populate('officerApproval.officer')
            .sort({ createdAt: -1 })
            .exec();
        
        res.json({ promotions });
    } catch (error) {
        console.error('Error fetching promotion logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all demotion logs
router.get('/api/demotions/logs', isAuthenticated, async (req, res) => {
    try {
        const demotions = await Demotion.find({})
            .populate('targetUser demotedBy')
            .sort({ createdAt: -1 })
            .exec();
        
        res.json({ demotions });
    } catch (error) {
        console.error('Error fetching demotion logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all promotion logs
router.get('/api/promotions/:id', isAuthenticated, async (req, res) => {
    try {
        const promotion = await Promotion.findById(req.params.id)
            .populate('targetUser promotedBy')
            .populate('officerApproval.officer');
        
        if (!promotion) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        
        res.json({ promotion });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/api/demotions/:id', isAuthenticated, async (req, res) => {
    try {
        const demotion = await Demotion.findById(req.params.id)
            .populate('targetUser demotedBy');
        
        if (!demotion) {
            return res.status(404).json({ error: 'Demotion not found' });
        }
        
        res.json({ demotion });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Approve promotion
router.post('/api/promotions/:id/approve', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const promotion = await Promotion.findById(req.params.id);
        if (!promotion) {
            return res.status(404).json({ error: 'Promotion not found' });
        }

        promotion.status = 'approved';
        promotion.officerApproval = {
            officer: req.user._id,
            date: new Date()
        };
        await promotion.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Reject promotion
router.post('/api/promotions/:id/reject', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const promotion = await Promotion.findById(req.params.id);
        if (!promotion) {
            return res.status(404).json({ error: 'Promotion not found' });
        }

        promotion.status = 'rejected';
        promotion.officerApproval = {
            officer: req.user._id,
            date: new Date(),
            rejectReason: req.body.reason
        };
        await promotion.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/api/demotions', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Only officers can process demotions' });
    }

    try {
        const { userId, demotionRank, reason } = req.body;
        const targetUser = await User.findById(userId);
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const demotion = new Demotion({
            targetUser: userId,
            demotedBy: req.user._id,
            previousRank: targetUser.highestRole,
            demotionRank,
            reason
        });

        await demotion.save();

        // Process the demotion immediately since it's from an officer
        const success = await handlePromotion(targetUser.discordId, demotionRank);
        
        if (success) {
            targetUser.highestRole = demotionRank;
            await targetUser.save();
            
            demotion.processed = true;
            await demotion.save();
            
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to update Discord roles' });
        }
    } catch (error) {
        console.error('Demotion error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get demotion logs
router.get('/api/demotions/logs', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const demotions = await Demotion.find({})
            .populate('targetUser demotedBy')
            .sort({ createdAt: -1 })
            .exec();
        
        res.json({ demotions });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit new training
router.post('/api/training/submit', async (req, res) => {
    try {
      const {
        trainees,
        startTime,
        endTime,
        eventName, // This is the field name from the form
        grade,     // This is the field name from the form
        outcome,
        remedialTrainees,
        failedTrainees,
      } = req.body;
  
      // Convert usernames to user IDs
      const findUserIds = async (nameStr) => {
        if (!nameStr) return [];
        const names = nameStr.split(',').map(t => t.trim()).filter(Boolean);
        const users = await User.find({ username: { $in: names } });
        return users.map(u => u._id);
      };
  
      const traineeIds = await findUserIds(trainees);
      const remedialIds = await findUserIds(remedialTrainees);
      const failedIds = await findUserIds(failedTrainees);
  
      // Ensure valid outcome
      const validOutcomes = ['Satisfactory', 'Remedial Training Advised', 'Training Failed'];
      if (!validOutcomes.includes(outcome)) {
        return res.status(400).send('Invalid training outcome.');
      }
  
      // Create form using the correct schema field names
      const form = new Training({
        trainees: traineeIds,
        traineeNamesRaw: trainees, // Save the raw names for reference
        startTime,
        endTime,
        trainingEvent: eventName, // Use the correct schema field name
        overallGrade: grade,      // Use the correct schema field name
        outcome,
        remedialTrainees: remedialIds,
        failedTrainees: failedIds,
        ncoSignature: req.user?._id, // Optional chaining in case not present
        status: 'Pending SNCO Review',
      });
  
      await form.save();
      res.redirect('/forms');
    } catch (err) {
      console.error('Error submitting training form:', err);
      res.status(500).send('Error submitting training form.');
    }
  });
  
  // SNCO Review Route - GET pending
  router.get('/api/training/pending-snco', async (req, res) => {
    try {
      // Fetch the forms pending SNCO review and populate necessary fields like trainees and event details
      const forms = await Training.find({ status: 'Pending SNCO Review' })
        .populate('trainees', 'username') // Populating trainees' usernames
        .populate('ncoSignature', 'username') // Populating NCO signature (e.g. username)
        .select('trainingEvent eventName overallGrade grade trainees startTime endTime outcome') // Include both possible field names
      
      res.json(forms);
    } catch (err) {
      console.error('Error loading SNCO forms:', err);
      res.status(500).send('Failed to load SNCO forms.');
    }
  });
  
  // SNCO Review - POST
  router.post('/api/training/snco-submit', async (req, res) => {
    try {
      const { formId, recommendedXP, remarks } = req.body;
  
      // Update the training form with XP and remarks - using the correct schema field names
      await Training.findByIdAndUpdate(formId, {
        sncoXPRecommendation: recommendedXP, // Use the correct schema field name
        sncoRemarks: remarks,                // Use the correct schema field name
        sncoSignature: req.user._id,
        status: 'Pending Officer Approval',
      });
  
      res.redirect('/forms');  // Redirect after submission
    } catch (err) {
      console.error('Error submitting SNCO review:', err);
      res.status(500).send('Error submitting review.');
    }
  });

  router.get('/training/:id', async (req, res) => {
    try {
        // Validate that the ID is a valid ObjectId before querying
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid training ID format' });
        }

        const form = await Training.findById(req.params.id)
            .populate('trainees', 'username');

        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }

        res.json(form);
    } catch (err) {
        console.error('Error fetching training form:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
  
  // Company Officer Review - GET pending
  router.get('/api/training/pending-officer', async (req, res) => {
    try {
      const forms = await Training.find({ status: 'Pending Officer Approval' })
        .populate('trainees', 'username')
        .populate('ncoSignature', 'username')
        .populate('sncoSignature', 'username')
        .populate('remedialTrainees', 'username')
        .populate('failedTrainees', 'username');
        
      // Process the data to ensure it's in the correct format for the client
      const processedForms = forms.map(form => {
        // Convert trainee objects to username strings if needed
        const trainees = form.trainees.map(trainee => 
          typeof trainee === 'object' ? trainee.username : trainee
        );
        
        // Convert remedial trainees if they exist
        const remedialTrainees = form.remedialTrainees && form.remedialTrainees.length ? 
          form.remedialTrainees.map(trainee => 
            typeof trainee === 'object' ? trainee.username : trainee
          ) : [];
        
        // Convert failed trainees if they exist
        const failedTrainees = form.failedTrainees && form.failedTrainees.length ? 
          form.failedTrainees.map(trainee => 
            typeof trainee === 'object' ? trainee.username : trainee
          ) : [];
        
        return {
          _id: form._id,
          trainingEvent: form.trainingEvent || 'Untitled Training',
          eventName: form.trainingEvent || 'Untitled Training', // Include both for compatibility
          trainees: trainees,
          startTime: form.startTime,
          endTime: form.endTime,
          overallGrade: form.overallGrade,
          grade: form.overallGrade, // Include both for compatibility
          outcome: form.outcome || 'Not specified',
          remedialTrainees: remedialTrainees,
          failedTrainees: failedTrainees,
          remarks: form.sncoRemarks || '',
          sncoRemarks: form.sncoRemarks || '',
          recommendedXP: form.sncoXPRecommendation || 0,
          sncoXPRecommendation: form.sncoXPRecommendation || 0,
          ncoSignature: typeof form.ncoSignature === 'object' ? form.ncoSignature.username : 'Unknown',
          sncoSignature: typeof form.sncoSignature === 'object' ? form.sncoSignature.username : 'Unknown'
        };
      });
      
      res.json(processedForms);
    } catch (err) {
      console.error('Error loading officer forms:', err);
      res.status(500).send('Failed to load officer forms.');
    }
  });
  
  // Company Officer Final Approval - POST
  router.post('/api/training/officer-submit', async (req, res) => {
    try {
      const { formId, xpAssignments } = req.body;
  
      const form = await Training.findById(formId);
      if (!form) return res.status(404).send('Form not found');
  
      const parsedXP = {};
      for (const username in xpAssignments) {
        parsedXP[username] = parseInt(xpAssignments[username], 10);
      }
  
      // Update each user's XP
      for (const [username, xp] of Object.entries(parsedXP)) {
        const user = await User.findOne({ username });
        if (user) {
          user.xp = (user.xp || 0) + xp;
          await user.save();
        }
      }
  
      // Use 'Completed' instead of 'Approved' to match the enum values in the schema
      form.status = 'Completed'; 
      form.officerSignature = req.user._id;
      form.finalXP = parsedXP;
      await form.save();
  
      res.redirect('/forms');
    } catch (err) {
      console.error('Error finalizing officer approval:', err);
      res.status(500).send('Error finalizing approval.');
    }
  });

  // Route to get all training forms without rank check
router.get('/api/training/all', async (req, res) => {
    try {
      // No authorization check - accessible to all authenticated users
      const forms = await Training.find({})
        .populate('trainees', 'username')
        .populate('ncoSignature', 'username')
        .populate('sncoSignature', 'username')
        .populate('officerSignature', 'username')
        .populate('xpApproved.user', 'username')
        .sort('-createdAt')
        .lean();
  
      res.json(forms);
    } catch (err) {
      console.error('Error fetching all training forms:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

 // HOLD route for training forms without rank check
router.post('/api/training/:id/hold', async (req, res) => {
    try {
      // No authorization check - accessible to all authenticated users
      const form = await Training.findById(req.params.id)
        .populate('xpApproved.user', 'username');
        
      if (!form) {
        return res.status(404).json({ error: 'Form not found' });
      }
  
      // If already on hold, remove hold (toggle behavior)
      if (form.status === 'HOLD') {
        form.status = form.sncoSignature && form.officerSignature ? 'Completed' :
                      form.sncoSignature ? 'Pending Officer Approval' : 'Pending SNCO Review';
        form.holdReason = null;
        form.heldBy = null;
        await form.save();
        return res.json({ success: true, message: 'Hold lifted.' });
      }
  
      // If not already held, place on hold
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: 'Reason for hold is required' });
      }
      
      // Store the previous status to restore it when the hold is lifted
      form.previousStatus = form.status;
      form.status = 'HOLD';
      form.holdReason = reason;
      form.heldBy = req.user._id;
  
      await form.save();
      res.json({ success: true, message: 'Training form placed on HOLD.' });
    } catch (err) {
      console.error('Error placing form on hold:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

// Get all users
router.get('/api/users', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find({}, 'username _id highestRole');
        res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/api/division/create', async (req, res) => {
    try {
        const { name, parentDivisionId } = req.body;

        const newDivision = new Division({
            name,
            parentDivision: parentDivisionId || null
        });

        await newDivision.save();
        res.redirect('/forms');
    } catch (err) {
        console.error('Division creation error:', err);
        res.status(500).send('Failed to create division.');
    }
});

router.get('/api/division/tree', async (req, res) => {
    try {
        const allDivisions = await Division.find({}).lean();

        // Build lookup map
        const divisionMap = {};
        allDivisions.forEach(div => {
            div.children = [];
            divisionMap[div._id] = div;
        });

        // Link children to their parents
        allDivisions.forEach(div => {
            if (div.parentDivision) {
                const parent = divisionMap[div.parentDivision.toString()];
                if (parent) {
                    parent.children.push(div);
                }
            }
        });

        // Build user ID list
        const allUserIds = [];
        allDivisions.forEach(div => {
            if (div.assignedUsers) {
                div.assignedUsers.forEach(au => {
                    if (au.userId) allUserIds.push(au.userId);
                });
            }
        });

        // Map user IDs to usernames
        const users = await User.find({ _id: { $in: allUserIds } }, 'username').lean();
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = user.username;
        });

        // Replace userId with username
        allDivisions.forEach(div => {
            div.assignedUsers = (div.assignedUsers || []).map(au => ({
                username: userMap[au.userId?.toString()] || 'Unknown',
                role: au.role
            }));
        });

        // Find root division
        const root = allDivisions.find(div => div.name === 'Headquarters Air Force');

        if (!root) {
            return res.status(404).json({ success: false, message: 'Headquarters Air Force not found.' });
        }

        res.json(root);
    } catch (err) {
        console.error('Division tree error:', err);
        res.status(500).json({ success: false, message: 'Failed to load division tree.' });
    }
});

router.post('/api/division/assign-user', async (req, res) => {
    try {
        const { userId, divisionId, role } = req.body;

        const user = await User.findById(userId);
        const division = await Division.findById(divisionId);

        if (!user || !division) {
            return res.status(404).send('User or division not found');
        }

        // Prevent duplicates
        const alreadyAssigned = division.assignedUsers.some(
            (entry) => entry.userId.toString() === userId
        );

        if (!alreadyAssigned) {
            division.assignedUsers.push({ userId, username: user.username, role });
            await division.save();
        }

        res.redirect('/forms');
    } catch (err) {
        console.error('Error assigning user to division:', err);
        res.status(500).send('Failed to assign user');
    }
});

router.post('/api/division-removal/submit', async (req, res) => {
    try {
      const { targetUser, targetDivision, reason, context } = req.body;
  
      const newRemoval = new DivisionRemoval({
        targetUser,
        targetDivision,
        reason,
        context,
        sncoSignature: req.user._id,
      });
  
      await newRemoval.save();
      res.redirect('/forms');
    } catch (err) {
      console.error('Error submitting Form 122:', err);
      res.status(500).send('Error submitting Division Removal form.');
    }
});

router.get('/forms/division-removal/officer-review', async (req, res) => {
    try {
      const forms = await DivisionRemoval.find({ status: 'Pending Officer Review' })
        .populate('targetUser targetDivision sncoSignature');
  
      res.render('divisionRemovalOfficerReview', { title: 'Review Form 122s', user: req.user, forms });
    } catch (err) {
      console.error('Error loading officer review forms:', err);
      res.status(500).send('Error loading forms.');
    }
});

router.post('/api/division-removal/officer-submit', async (req, res) => {
    try {
      const { formId, officerComments } = req.body;
  
      await DivisionRemoval.findByIdAndUpdate(formId, {
        officerComments,
        officerSignature: req.user._id,
        status: 'Pending Field Officer Decision',
      });
  
      res.redirect('/forms');
    } catch (err) {
      console.error('Error submitting officer review:', err);
      res.status(500).send('Error submitting review.');
    }
});

router.get('/api/division-removal/field-review', async (req, res) => {
    try {
      const forms = await DivisionRemoval.find({ status: 'Pending Field Officer Decision' })
        .populate('targetUser targetDivision sncoSignature officerSignature');
  
      const sanitizedForms = forms.map(f => ({
        _id: f._id,
        targetUser: f.targetUser ? { username: f.targetUser.username } : null,
        targetDivision: f.targetDivision ? { name: f.targetDivision.name } : null,
        sncoSignature: f.sncoSignature ? { username: f.sncoSignature.username } : null,
        officerSignature: f.officerSignature ? { username: f.officerSignature.username } : null,
        reason: f.reason,
        officerComments: f.officerComments || '',
      }));
  
      res.json(sanitizedForms);
    } catch (err) {
      console.error('Error fetching field review forms (JSON):', err);
      res.status(500).json({ error: 'Failed to load forms.' });
    }
  });

router.post('/api/division-removal/field-submit', async (req, res) => {
    try {
      const { formId, fieldDecision, fieldNotes } = req.body;
      const form = await DivisionRemoval.findById(formId);
  
      if (!form) return res.status(404).send('Form not found');
  
      form.fieldDecision = fieldDecision;
      form.fieldNotes = fieldNotes;
      form.fieldSignature = req.user._id;
      form.status = fieldDecision === 'Approved' ? 'Approved' : 'Blocked';
  
      // If approved, remove user from division
      if (fieldDecision === 'Approved') {
        const division = await Division.findById(form.targetDivision);
        if (division) {
          division.assignedUsers = division.assignedUsers.filter(
            (entry) => entry.userId.toString() !== form.targetUser.toString()
          );
          await division.save();
        }
      }
  
      await form.save();
      res.redirect('/forms');
    } catch (err) {
      console.error('Error submitting field officer decision:', err);
      res.status(500).send('Error finalizing removal.');
    }
});
  
// Submit new performance report
router.post('/api/performance/submit', async (req, res) => {
    try {
      const {
        targetUser,
        division, // We'll still accept this, but use it only if valid
        periodStart,
        periodEnd,
        communication,
        discipline,
        teamwork,
        leadershipPotential,
        technicalSkill,
        remarks,
        strengths,
        weaknesses,
        recommendedXP,
        promotionRecommended,
        additionalTraining,
        disciplinaryWatch
      } = req.body;
  
      // Validate required fields
      if (!targetUser || !periodStart || !periodEnd) {
        return res.status(400).send('Required fields are missing');
      }
      
      // Calculate weighted score
      const weights = {
        communication: 0.2,
        discipline: 0.2,
        teamwork: 0.2,
        leadershipPotential: 0.2,
        technicalSkill: 0.2
      };
  
      const communicationNum = Number(communication) || 0;
      const disciplineNum = Number(discipline) || 0;
      const teamworkNum = Number(teamwork) || 0;
      const leadershipPotentialNum = Number(leadershipPotential) || 0;
      const technicalSkillNum = Number(technicalSkill) || 0;
  
      const calculatedScore = 
        (communicationNum * weights.communication) +
        (disciplineNum * weights.discipline) +
        (teamworkNum * weights.teamwork) +
        (leadershipPotentialNum * weights.leadershipPotential) +
        (technicalSkillNum * weights.technicalSkill);
  
      // Try to find the user's division if not provided or invalid
      let divisionId = null;
      
      // If division is provided and valid, use it
      if (division && mongoose.Types.ObjectId.isValid(division)) {
        divisionId = division;
      } else {
        // Look up the user's division
        const userDivision = await Division.findOne({ 'personnel.user': targetUser });
        
        if (userDivision) {
          divisionId = userDivision._id;
        } else {
          // If we need to create a "Divisionless" division (optional)
          // You can uncomment this if you want to create a special division
          /*
          let divisionless = await Division.findOne({ name: 'Divisionless' });
          if (!divisionless) {
            divisionless = new Division({
              name: 'Divisionless',
              description: 'For personnel without an assigned division'
            });
            await divisionless.save();
          }
          divisionId = divisionless._id;
          */
        }
      }
  
      // Create the report
      const reportData = {
        targetUser,
        evaluator: req.user._id,
        periodStart,
        periodEnd,
        communication: communicationNum,
        discipline: disciplineNum,
        teamwork: teamworkNum,
        leadershipPotential: leadershipPotentialNum,
        technicalSkill: technicalSkillNum,
        remarks,
        strengths,
        weaknesses,
        recommendedXP: Number(recommendedXP) || 0,
        promotionRecommended: !!promotionRecommended,
        additionalTraining: !!additionalTraining,
        disciplinaryWatch: !!disciplinaryWatch,
        calculatedScore,
        status: 'Submitted',
        createdAt: new Date()
      };
      
      // Only add division if we found a valid one
      if (divisionId) {
        reportData.division = divisionId;
      }
  
      const report = new PerformanceReport(reportData);
      await report.save();
      res.redirect('/forms');
    } catch (err) {
      console.error('Error submitting performance report:', err);
      res.status(500).send('Failed to submit performance report: ' + err.message);
    }
  });
  
  router.get('/api/performance/all', async (req, res) => {
    try {
      const reports = await PerformanceReport.find({})
        .populate('targetUser', 'username') // Changed from 'trainee' to 'targetUser' to match your schema
        .populate('evaluator', 'username')
        .sort('-evaluationDate');
  
      res.json({ reports });
    } catch (err) {
      console.error('Error fetching performance reports:', err);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });
  
  // PUT a report on hold - accessible to all authenticated users
  router.post('/api/performance/:id/hold', async (req, res) => {
    try {
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) return res.status(404).send('Report not found');
  
      report.status = 'Hold';
      // Check if trainingEvent exists before appending to it
      if (report.trainingEvent) {
        report.trainingEvent += ' (HOLD)';
      } else {
        // Set a default value if trainingEvent doesn't exist
        report.trainingEvent = 'Performance Report (HOLD)';
      }
      await report.save();
  
      res.json({ success: true });
    } catch (err) {
      console.error('Error putting report on hold:', err);
      res.status(500).send('Failed to place report on hold');
    }
  });

  // Get a specific performance report
  router.get('/api/performance/:id', async (req, res) => {
    try {
      const report = await PerformanceReport.findById(req.params.id)
        .populate('targetUser', 'username')
        .populate('ncoSignature', 'username')
        .populate('sncoSignature', 'username')
        .populate('officerSignature', 'username')
        .populate('sncoReviewer', 'username')
        .populate('division', 'name');
      
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      res.json({ report });
    } catch (err) {
      console.error('Error fetching performance report:', err);
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  });
  
  // Update a performance report (SNCO review)
  router.post('/api/performance/:id/update', async (req, res) => {
    try {
      const { flag, sncoRemarks } = req.body;
      
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      // Update fields
      if (flag !== undefined) {
        report.flag = flag === 'none' ? null : flag;
      }
      
      if (sncoRemarks !== undefined) {
        report.sncoRemarks = sncoRemarks;
      }
      
      // Mark as reviewed by SNCO
      report.sncoReviewer = req.user._id;
      report.sncoReviewDate = new Date();
      report.sncoSignature = req.user._id;
      
      // If flagged as red, update status
      if (flag === 'red') {
        report.status = 'Flagged';
      } else if (report.status === 'Submitted') {
        report.status = 'Reviewed';
      }
      
      await report.save();
      
      res.json({ 
        success: true, 
        message: 'Performance report updated successfully' 
      });
    } catch (err) {
      console.error('Error updating performance report:', err);
      res.status(500).json({ error: 'Failed to update report' });
    }
  });
  
  // Add a comment to a performance report
  router.post('/api/performance/:id/comment', async (req, res) => {
    try {
      const { comment } = req.body;
      
      if (!comment) {
        return res.status(400).json({ error: 'Comment is required' });
      }
      
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      // Initialize comments array if it doesn't exist
      if (!report.comments) {
        report.comments = [];
      }
      
      // Add new comment
      report.comments.push({
        user: req.user._id,
        text: comment,
        date: new Date()
      });
      
      await report.save();
      
      res.json({ 
        success: true, 
        message: 'Comment added successfully' 
      });
    } catch (err) {
      console.error('Error adding comment to performance report:', err);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  });
  
  // Update the route that puts a report on hold to work with your schema
  router.post('/api/performance/:id/hold', async (req, res) => {
    try {
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) return res.status(404).send('Report not found');
  
      // Toggle between Hold and previous status
      if (report.status === 'Hold') {
        // If currently on hold, restore to appropriate status based on signatures
        if (report.officerSignature) {
          report.status = 'Finalized';
        } else if (report.sncoSignature) {
          report.status = 'Reviewed';
        } else {
          report.status = 'Submitted';
        }
      } else {
        // If not on hold, place on hold and remember current status
        report.previousStatus = report.status; // Optional: store previous status
        report.status = 'Hold';
      }
      
      await report.save();
  
      res.json({ success: true });
    } catch (err) {
      console.error('Error toggling hold status:', err);
      res.status(500).send('Failed to update hold status');
    }
  });

// Update a performance report (Officer review)
router.post('/api/performance/:id/officer-update', async (req, res) => {
    try {
      const { flag, officerComments } = req.body;
      
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      // Update fields
      if (flag !== undefined) {
        report.flag = flag === 'none' ? null : flag;
      }
      
      if (officerComments !== undefined) {
        report.officerComments = officerComments;
      }
      
      // Add officer review info
      report.officerReviewer = req.user._id;
      report.officerReviewDate = new Date();
      
      // If flagged as red, update status
      if (flag === 'red') {
        report.status = 'Flagged';
      }
      
      await report.save();
      
      res.json({ 
        success: true, 
        message: 'Performance report updated successfully' 
      });
    } catch (err) {
      console.error('Error updating performance report by officer:', err);
      res.status(500).json({ error: 'Failed to update report' });
    }
  });
  
  // Finalize a report
  router.post('/api/performance/:id/finalize', async (req, res) => {
    try {
      const report = await PerformanceReport.findById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      // Check if the report has been reviewed by an SNCO
      if (!report.sncoReviewer && !report.sncoSignature) {
        return res.status(400).json({ 
          error: 'Report must be reviewed by an SNCO before finalization' 
        });
      }
      
      // Update report status
      report.status = 'Finalized';
      report.officerSignature = req.user._id;
      report.finalizedDate = new Date();
      
      await report.save();
      
      res.json({ 
        success: true, 
        message: 'Report finalized successfully' 
      });
    } catch (err) {
      console.error('Error finalizing report:', err);
      res.status(500).json({ error: 'Failed to finalize report' });
    }
  });
  
  // Award XP based on performance report
  router.post('/api/performance/:id/award-xp', async (req, res) => {
    try {
      const { xp, reason } = req.body;
      
      if (isNaN(parseInt(xp))) {
        return res.status(400).json({ error: 'XP must be a valid number' });
      }
      
      const report = await PerformanceReport.findById(req.params.id)
        .populate('targetUser');
      
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }
      
      // Get the target user
      const targetUser = await User.findById(report.targetUser._id || report.targetUser);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }
      
      // Award the XP
      targetUser.xp = (targetUser.xp || 0) + parseInt(xp);
      await targetUser.save();
      
      // Update the report with XP award information
      if (!report.xpAwards) {
        report.xpAwards = [];
      }
      
      report.xpAwards.push({
        xp: parseInt(xp),
        awardedBy: req.user._id,
        date: new Date(),
        reason: reason || 'Performance report XP award'
      });
      
      // Update the report status if not already finalized
      if (report.status !== 'Finalized') {
        report.status = 'Reviewed';
      }
      
      await report.save();
      
      res.json({ 
        success: true, 
        message: `${xp} XP awarded to ${targetUser.username}` 
      });
    } catch (err) {
      console.error('Error awarding XP:', err);
      res.status(500).json({ error: 'Failed to award XP' });
    }
  });
  
  // Get all performance reports for officer dashboard with detailed filtering
  router.get('/api/performance/officer/dashboard', async (req, res) => {
    try {
      const { status, flag, dateFrom, dateTo, search } = req.query;
      
      // Build the query
      const query = {};
      
      // Add status filter
      if (status && status !== 'all') {
        if (status === 'priority') {
          query.flag = { $in: ['red', 'yellow'] };
        } else if (['red', 'yellow', 'green', 'blue'].includes(status)) {
          query.flag = status;
        } else {
          query.status = status;
        }
      }
      
      // Add date range filter
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
          query.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = toDate;
        }
      }
      
      // Get the reports with populated fields
      const reports = await PerformanceReport.find(query)
        .populate('targetUser', 'username')
        .populate('evaluator', 'username')
        .populate('division', 'name')
        .populate('sncoReviewer', 'username')
        .populate('officerSignature', 'username')
        .sort('-createdAt');
      
      // Apply search filter in memory if needed
      let filteredReports = reports;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredReports = reports.filter(report => {
          // Search in member name
          const memberName = report.targetUser ? 
            (typeof report.targetUser === 'object' ? report.targetUser.username.toLowerCase() : '') : '';
          
          // Search in evaluator name
          const evaluatorName = report.evaluator ? 
            (typeof report.evaluator === 'object' ? report.evaluator.username.toLowerCase() : '') : '';
          
          // Search in division name
          const divisionName = report.division ? 
            (typeof report.division === 'object' ? report.division.name.toLowerCase() : '') : '';
          
          return memberName.includes(searchLower) || 
                 evaluatorName.includes(searchLower) || 
                 divisionName.includes(searchLower);
        });
      }
      
      res.json({ 
        success: true, 
        reports: filteredReports,
        totalCount: reports.length,
        filteredCount: filteredReports.length
      });
    } catch (err) {
      console.error('Error fetching officer dashboard data:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });
    
    // Generate a PDF report
    router.get('/api/performance/:id/pdf', async (req, res) => {
        try {
          const report = await PerformanceReport.findById(req.params.id)
            .populate('targetUser', 'username highestRole')
            .populate('evaluator', 'username highestRole')
            .populate('division', 'name')
            .populate('sncoReviewer', 'username highestRole')
            .populate('officerSignature', 'username highestRole');
          
          if (!report) {
            return res.status(404).json({ error: 'Report not found' });
          }
          
          // In a real implementation, you would generate a PDF here using a library like PDFKit
          // For now, we'll just return the data as JSON
          res.json({ 
            success: true, 
            report,
            message: 'PDF generation would happen here in a production environment' 
          });
          
          /* Example PDF generation code (commented out)
          const PDFDocument = require('pdfkit');
          const doc = new PDFDocument();
          
          // Set the response headers
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=performance-report-${report._id}.pdf`);
          
          // Pipe the PDF to the response
          doc.pipe(res);
          
          // Add content to the PDF
          doc.fontSize(25).text('Performance Report', { align: 'center' });
          doc.moveDown();
          doc.fontSize(14).text(`Member: ${report.targetUser.username}`);
          doc.text(`Evaluator: ${report.evaluator.username}`);
          doc.text(`Period: ${new Date(report.periodStart).toLocaleDateString()} to ${new Date(report.periodEnd).toLocaleDateString()}`);
          doc.moveDown();
          
          // Add more content as needed...
          
          // Finalize the PDF and end the response
          doc.end();
          */
        } catch (err) {
          console.error('Error generating PDF:', err);
          res.status(500).json({ error: 'Failed to generate PDF' });
        }
      });
    
    // Get performance statistics for leadership dashboard
    router.get('/api/performance/stats', async (req, res) => {
        try {
          // Get counts by status
          const statusCounts = await PerformanceReport.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ]);
          
          // Get counts by flag
          const flagCounts = await PerformanceReport.aggregate([
            { $group: { _id: '$flag', count: { $sum: 1 } } }
          ]);
          
          // Get monthly counts for the last 6 months
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          
          const monthlyData = await PerformanceReport.aggregate([
            { 
              $match: { 
                createdAt: { $gte: sixMonthsAgo } 
              } 
            },
            {
              $group: {
                _id: { 
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' }
                },
                count: { $sum: 1 },
                avgScore: { $avg: '$calculatedScore' }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
          ]);
          
          // Calculate the average score of all reports
          const averageScore = await PerformanceReport.aggregate([
            {
              $group: {
                _id: null,
                average: { $avg: '$calculatedScore' }
              }
            }
          ]);
          
          // Format the status counts into a more user-friendly format
          const statusStats = statusCounts.reduce((acc, curr) => {
            acc[curr._id || 'Unknown'] = curr.count;
            return acc;
          }, {});
          
          // Format the flag counts
          const flagStats = flagCounts.reduce((acc, curr) => {
            acc[curr._id || 'None'] = curr.count;
            return acc;
          }, {});
          
          // Format the monthly data
          const formattedMonthlyData = monthlyData.map(item => {
            const monthNames = [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            return {
              month: monthNames[item._id.month - 1],
              year: item._id.year,
              label: `${monthNames[item._id.month - 1]} ${item._id.year}`,
              count: item.count,
              averageScore: item.avgScore ? item.avgScore.toFixed(2) : 'N/A'
            };
          });
          
          res.json({
            success: true,
            stats: {
              total: await PerformanceReport.countDocuments(),
              statusCounts: statusStats,
              flagCounts: flagStats,
              averageScore: averageScore.length > 0 ? averageScore[0].average.toFixed(2) : 'N/A',
              monthlyData: formattedMonthlyData
            }
          });
        } catch (err) {
          console.error('Error generating statistics:', err);
          res.status(500).json({ error: 'Failed to generate statistics' });
        }
      });
    
    // Get performance reports for a specific user
    router.get('/api/performance/user/:userId', async (req, res) => {
        try {
          const reports = await PerformanceReport.find({ targetUser: req.params.userId })
            .populate('evaluator', 'username')
            .populate('division', 'name')
            .sort('-createdAt');
          
          res.json({ reports });
        } catch (err) {
          console.error('Error fetching user performance reports:', err);
          res.status(500).json({ error: 'Failed to fetch reports' });
        }
      });
    
    // Get recent activity for officer dashboard
    router.get('/api/performance/recent-activity', async (req, res) => {
        try {
          // Get the 10 most recent reports
          const recentReports = await PerformanceReport.find({})
            .populate('targetUser', 'username')
            .populate('evaluator', 'username')
            .populate('sncoReviewer', 'username')
            .populate('officerSignature', 'username')
            .sort('-createdAt')
            .limit(10);
          
          // Format the activity feed
          const activityFeed = recentReports.map(report => {
            const memberName = report.targetUser ? 
              (typeof report.targetUser === 'object' ? report.targetUser.username : 'Unknown') : 'Unknown';
            
            let activityType = 'created';
            let actorName = report.evaluator ? 
              (typeof report.evaluator === 'object' ? report.evaluator.username : 'Unknown') : 'Unknown';
            let date = report.createdAt;
            
            if (report.status === 'Finalized') {
              activityType = 'finalized';
              actorName = report.officerSignature ? 
                (typeof report.officerSignature === 'object' ? report.officerSignature.username : 'Unknown') : 'Unknown';
              date = report.finalizedDate || report.updatedAt || report.createdAt;
            } else if (report.sncoReviewer) {
              activityType = 'reviewed';
              actorName = typeof report.sncoReviewer === 'object' ? report.sncoReviewer.username : 'Unknown';
              date = report.sncoReviewDate || report.updatedAt || report.createdAt;
            }
            
            return {
              reportId: report._id,
              date,
              memberName,
              actorName,
              activityType,
              status: report.status,
              flag: report.flag
            };
          });
          
          res.json({ 
            success: true, 
            activityFeed 
          });
        } catch (err) {
          console.error('Error fetching recent activity:', err);
          res.status(500).json({ error: 'Failed to fetch activity' });
        }
      });
    
      const RANKS = [
        "Citizen", "Airman Basic", "Airman", "Airman First Class", "Senior Airman",
        "Staff Sergeant", "Technical Sergeant", "Master Sergeant", "First Sergeant",
        "Senior Master Sergeant", "Senior First Sergeant", "Chief Master Sergeant",
        "Chief First Sergeant", "Command Chief Master Sergeant", "Senior Enlisted Leader",
        "Chief Senior Enlisted Leader", "Chief Master Sergeant of the Air Force",
        "Second Lieutenant", "First Lieutenant", "Captain",
        "Major", "Lieutenant Colonel", "Colonel",
        "Brigadier General", "Major General", "Lieutenant General", "General", "General of the Air Force"
      ];
      
      // Live user search (for autocomplete)
      router.get('/api/users/search', async (req, res) => {
        const { username } = req.query;
      
        if (!username) return res.status(400).json({ error: 'Username query required' });
      
        try {
          const users = await User.find({ username: { $regex: username, $options: 'i' } })
                                  .limit(10)
                                  .select('username');
          res.json(users);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: 'Server error' });
        }
      });
      
      // Fetch user details (rank and XP)
      router.get('/api/users/:username', async (req, res) => {
        try {
          const user = await User.findOne({ username: req.params.username });
      
          if (!user) return res.status(404).json({ error: 'User not found' });
      
          const rankIndex = RANKS.indexOf(user.highestRole);
          const isSlotBased = rankIndex >= RANKS.indexOf('First Sergeant');
      
          let nextRank = null;
          let nextXP = null;
      
          if (!isSlotBased && rankIndex + 1 < RANKS.length) {
            nextRank = RANKS[rankIndex + 1];
            
            // Logic to determine nextXP (this logic is based on your existing XP system)
            nextXP = calculateXPForNextRank(nextRank); // You must implement this function according to your XP system
          }
      
          res.json({
            rank: user.highestRole,
            xp: user.xp,
            nextRank,
            nextXP,
            isSlotBased
          });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: 'Server error' });
        }
      });
      
      // Submit Promotion Request
      router.post('/api/promotion-request/submit', async (req, res) => {
        const { targetUserId, recommendation } = req.body;
        const requesterId = req.user && req.user._id;
      
        if (!requesterId) {
          return res.status(401).json({ error: 'Unauthorized: Requester ID missing' });
        }
      
        try {
          const targetUser = await User.findById(targetUserId);
      
          if (!targetUser) {
            return res.status(404).json({ error: 'Target user not found' });
          }
      
          // Change here: 'rank' → 'highestRole'
          if (!targetUser.highestRole || typeof targetUser.xp !== 'number') {
            return res.status(400).json({ error: 'Target user lacks rank or XP data' });
          }
      
          const rankIndex = RANKS.indexOf(targetUser.highestRole);
      
          if (rankIndex === -1) {
            return res.status(400).json({ error: 'Invalid current rank for user' });
          }
      
          const isSlotBased = rankIndex >= RANKS.indexOf('First Sergeant');
      
          if (rankIndex + 1 >= RANKS.length) {
            return res.status(400).json({ error: 'User is already at the highest possible rank' });
          }
      
          const nextRank = !isSlotBased ? RANKS[rankIndex + 1] : null;
          const nextXP = !isSlotBased ? calculateXPForNextRank(nextRank) : null;
      
          const promotionRequest = new PromotionRequest({
            requesterId,
            targetUserId,
            currentRank: targetUser.highestRole, // ✅ fixed here
            currentXP: targetUser.xp,
            nextRank,
            nextXP,
            isSlotBased,
            recommendation
          });
      
          await promotionRequest.save();
      
          res.status(200).json({ message: 'Promotion request submitted successfully' });
      
        } catch (err) {
          console.error("Error submitting promotion request:", err);
          res.status(500).json({ error: 'Server error', details: err.message });
        }
      });
      
      // Helper function (you must adjust according to your XP system)
      function calculateXPForNextRank(nextRank) {
        const xpRequirements = {
          "Airman": 10,
          "Airman First Class": 25,
          "Senior Airman": 50,
          "Staff Sergeant": 100,
          "Technical Sergeant": 150,
          "Master Sergeant": 250,
          "First Sergeant": 350
        };
      
        return xpRequirements[nextRank] || null;
      }

// Get all pending promotion requests
router.get('/api/promotion-request/pending', async (req, res) => {
    try {
      const pendingRequests = await PromotionRequest.find({ status: 'Pending' })
        .populate('targetUserId requesterId', 'username highestRole xp')
        .sort({ createdAt: -1 });
  
      res.json(pendingRequests);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error fetching pending requests' });
    }
  });

  router.get('/api/users/:userId/deep-search', async (req, res) => {
    const userId = req.params.userId;
  
    try {
      // Division Removals
      const divisionRemovals = await DivisionRemoval.find({ targetUser: userId })
        .populate('targetDivision', 'name')
        .populate('sncoSignature officerSignature fieldSignature', 'username highestRole')
        .sort('-createdAt')
        .lean();
  
      // Performance Reports
      const performanceReports = await PerformanceReport.find({ targetUser: userId })
        .populate('division', 'name')
        .populate('evaluator sncoReviewer officerReviewer', 'username highestRole')
        .sort('-createdAt')
        .lean();
  
      // Training Reports
      const trainingReports = await Training.find({ trainees: userId })
        .populate('ncoSignature sncoSignature officerSignature', 'username highestRole')
        .sort('-startTime')
        .lean();
  
      // Promotion History
      const promotionHistory = await PromotionRequest.find({ targetUserId: userId })
        .populate('requesterId reviewedBy', 'username highestRole')
        .sort('-createdAt')
        .lean();
  
      res.json({
        divisionRemovals,
        performanceReports,
        trainingReports,
        promotionHistory
      });
  
    } catch (err) {
      console.error('Deep Search Error:', err);
      res.status(500).json({ error: 'Deep Search failed', details: err.message });
    }
  });

  router.post('/api/promotion-request/:id/decision', async (req, res) => {
    const requestId = req.params.id;
    const { decision } = req.body; // decision = "Approved" or "Denied"
  
    try {
      const promotionRequest = await PromotionRequest.findById(requestId).populate('targetUserId');
  
      if (!promotionRequest) {
        return res.status(404).json({ error: 'Promotion request not found' });
      }
  
      if (promotionRequest.status !== 'Pending') {
        return res.status(400).json({ error: 'This request has already been processed' });
      }
  
      promotionRequest.status = decision;
      promotionRequest.reviewedAt = Date.now();
      promotionRequest.reviewedBy = req.user._id;
      await promotionRequest.save();
  
      // Promote user if approved
      if (decision === 'Approved') {
        const user = await User.findById(promotionRequest.targetUserId);
  
        const isSlotBased = RANKS.indexOf(promotionRequest.nextRank) > RANKS.indexOf('First Sergeant');
        if (!isSlotBased && promotionRequest.nextXP) {
          user.xp = promotionRequest.nextXP; // set to minimum required XP
        }
        user.highestRole = promotionRequest.nextRank;
  
        await user.save();
      }
  
      res.json({ message: `Request ${decision}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Promotion decision failed', details: err.message });
    }
  });










// Submit recruitment
router.post('/api/recruitment', async (req, res) => {
    try {
        const {
            fullName,
            username,
            discordUsername,
            timezone,
            careerInterest,
            remarks,
            hoursPerWeek,
            referredBy
        } = req.body;

        const newRequest = new RecruitmentRequest({
            fullName,
            username,
            discordUsername,
            timezone,
            careerInterest,
            remarks,
            hoursPerWeek,
            referredBy,
            submittedBy: req.user._id,
            submittedByName: req.user.fullName || req.user.username
        });

        await newRequest.save();
        res.redirect('/forms'); // Or wherever you want to redirect after submit
    } catch (err) {
        console.error('Recruitment error:', err);
        res.status(400).send('Error submitting recruitment request');
    }
});

// Get pending placements for SNCO review
router.get('/api/recruitment/pending', isAuthenticated, async (req, res) => {
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const query = { 
            status: { $in: ['pending', 'bumped_back'] }
        };

        const recruitments = await Recruitment.find(query)
            .populate('recruiter', 'username')
            .populate('targetDivision', 'name')
            .sort('-dateSubmitted');

        res.json({ 
            recruitments,
            user: {
                isSenior: req.user.isSenior,
                isOfficer: req.user.isOfficer
            }
        });
    } catch (error) {
        console.error('Error fetching pending recruitments:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get bumped placements for officer review
router.get('/api/recruitment/bumped', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const recruitments = await Recruitment.find({ status: 'bumped_up' })
            .populate('recruiter', 'username')
            .populate('targetDivision', 'name')
            .populate('reviewChain.reviewer', 'username')
            .sort('-dateSubmitted');

        res.json({ recruitments });
    } catch (error) {
        console.error('Error fetching bumped recruitments:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Handle recruitment actions (approve/bump/reject)
router.post('/api/recruitment/:id/:action', isAuthenticated, async (req, res) => {
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const recruitment = await Recruitment.findById(req.params.id)
            .populate('targetDivision')
            .populate('recruiter', 'username');

        if (!recruitment) {
            return res.status(404).json({ error: 'Recruitment not found' });
        }

        // First find or create the user
        let user = await User.findOne({ username: recruitment.recruitUsername });
        if (!user) {
            user = new User({
                username: recruitment.recruitUsername,
                discordId: recruitment.recruitDiscord,
                highestRole: recruitment.recruitRank
            });
            await user.save();
        }

        switch (req.params.action) {
            case 'approve':
                // Handle regular approval using original division
                const division = await Division.findById(recruitment.targetDivision._id);
                if (!division) {
                    return res.status(404).json({ error: 'Division not found' });
                }

                division.personnel.push({
                    user: user._id,
                    position: recruitment.divisionPosition
                });
                await division.save();

                recruitment.status = 'approved';
                recruitment.finalDivision = division._id;
                break;

            case 'manual_place':
                if (!req.user.isOfficer) {
                    return res.status(403).json({ error: 'Only officers can manually place recruits' });
                }
                // Handle manual placement by officer
                const newDivision = await Division.findById(req.body.newDivisionId);
                if (!newDivision) {
                    return res.status(404).json({ error: 'New division not found' });
                }

                newDivision.personnel.push({
                    user: user._id,
                    position: recruitment.divisionPosition
                });
                await newDivision.save();

                recruitment.status = 'approved';
                recruitment.finalDivision = newDivision._id;
                break;

            case 'bump_up':
                if (!req.user.isSenior) {
                    return res.status(403).json({ error: 'Only SNCOs can bump up' });
                }
                recruitment.status = 'bumped_up';
                break;

            case 'bump_back':
                if (!req.user.isOfficer) {
                    return res.status(403).json({ error: 'Only officers can bump back' });
                }
                recruitment.status = 'bumped_back';
                break;

            case 'reject':
                recruitment.status = 'rejected';
                break;

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        // Add to review chain
        recruitment.reviewChain.push({
            reviewer: req.user._id,
            action: req.params.action,
            notes: req.body.notes,
            date: new Date()
        });

        await recruitment.save();

        // Return success with message
        let message = '';
        switch (req.params.action) {
            case 'approve':
            case 'manual_place':
                message = 'Recruit successfully placed in division';
                break;
            case 'bump_up':
                message = 'Recruitment bumped up to officer review';
                break;
            case 'bump_back':
                message = 'Recruitment returned to SNCO review';
                break;
            case 'reject':
                message = 'Recruitment rejected';
                break;
        }

        res.json({ success: true, message });
    } catch (error) {
        console.error('Error processing recruitment action:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

router.get('/api/regulations/active', isAuthenticated, async (req, res) => {
    try {
        const regulations = await Regulation.find({ isActive: true })
            .populate('addedBy', 'username')
            .populate('lastModifiedBy', 'username')
            .sort('-dateAdded');
        
        res.json({ regulations });
    } catch (error) {
        console.error('Error fetching regulations:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single regulation
router.get('/api/regulations/:id', isAuthenticated, async (req, res) => {
    try {
        const regulation = await Regulation.findById(req.params.id)
            .populate('addedBy', 'username')
            .populate('lastModifiedBy', 'username')
            .populate('changeHistory.modifiedBy', 'username');

        if (!regulation) {
            return res.status(404).json({ error: 'Regulation not found' });
        }

        res.json({ regulation });
    } catch (error) {
        console.error('Error fetching regulation:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add new regulation
router.post('/api/regulations', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Only officers can add regulations' });
    }

    try {
        const { title, category, description, content } = req.body;

        // Check for required fields
        if (!title || !category || !description || !content) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const regulation = new Regulation({
            title,
            category,
            description,
            content,
            addedBy: req.user._id,
            lastModifiedBy: req.user._id,
            changeHistory: [{
                modifiedBy: req.user._id,
                changeType: 'added',
                newContent: content
            }]
        });

        await regulation.save();
        res.json({ success: true, regulation });
    } catch (error) {
        console.error('Error adding regulation:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update regulation
router.put('/api/regulations/:id', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Only officers can modify regulations' });
    }

    try {
        const regulation = await Regulation.findById(req.params.id);
        if (!regulation) {
            return res.status(404).json({ error: 'Regulation not found' });
        }

        const { title, category, description, content, reason } = req.body;

        // Store previous values for change history
        const previousContent = regulation.content;

        // Update fields
        regulation.title = title || regulation.title;
        regulation.category = category || regulation.category;
        regulation.description = description || regulation.description;
        regulation.content = content || regulation.content;
        regulation.lastModified = new Date();
        regulation.lastModifiedBy = req.user._id;

        // Add to change history if content was modified
        if (content && content !== previousContent) {
            regulation.changeHistory.push({
                modifiedBy: req.user._id,
                changeType: 'modified',
                previousContent,
                newContent: content,
                reason
            });
        }

        await regulation.save();
        res.json({ success: true, regulation });
    } catch (error) {
        console.error('Error updating regulation:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove regulation (soft delete)
router.delete('/api/regulations/:id', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Only officers can remove regulations' });
    }

    try {
        const regulation = await Regulation.findById(req.params.id);
        if (!regulation) {
            return res.status(404).json({ error: 'Regulation not found' });
        }

        // Soft delete
        regulation.isActive = false;
        regulation.dateRemoved = new Date();
        regulation.removedBy = req.user._id;
        regulation.changeHistory.push({
            modifiedBy: req.user._id,
            changeType: 'removed',
            previousContent: regulation.content,
            reason: req.body.reason
        });

        await regulation.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing regulation:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get regulation logs
router.get('/api/regulations/logs', isAuthenticated, async (req, res) => {
    try {
        // Aggregate all changes across all regulations
        const regulations = await Regulation.find({})
            .populate('addedBy', 'username')
            .populate('removedBy', 'username')
            .populate('changeHistory.modifiedBy', 'username');

        let logs = [];
        regulations.forEach(regulation => {
            // Add initial creation log
            logs.push({
                _id: regulation._id + '_creation',
                title: regulation.title,
                modifiedDate: regulation.dateAdded,
                modifiedBy: regulation.addedBy,
                changeType: 'added',
                reason: 'Initial creation'
            });

            // Add all change history
            regulation.changeHistory.forEach(change => {
                logs.push({
                    _id: change._id,
                    title: regulation.title,
                    modifiedDate: change.modifiedDate,
                    modifiedBy: change.modifiedBy,
                    changeType: change.changeType,
                    reason: change.reason,
                    previousContent: change.previousContent,
                    newContent: change.newContent
                });
            });
        });

        // Sort by date, most recent first
        logs.sort((a, b) => b.modifiedDate - a.modifiedDate);

        res.json({ logs });
    } catch (error) {
        console.error('Error fetching regulation logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get specific log details
router.get('/api/regulations/logs/:logId', isAuthenticated, async (req, res) => {
    try {
        const [regulationId, changeId] = req.params.logId.split('_');
        
        const regulation = await Regulation.findById(regulationId)
            .populate('addedBy', 'username')
            .populate('changeHistory.modifiedBy', 'username');

        if (!regulation) {
            return res.status(404).json({ error: 'Log not found' });
        }

        let log;
        if (changeId === 'creation') {
            log = {
                _id: req.params.logId,
                title: regulation.title,
                modifiedDate: regulation.dateAdded,
                modifiedBy: regulation.addedBy,
                changeType: 'added',
                reason: 'Initial creation',
                newContent: regulation.content
            };
        } else {
            log = regulation.changeHistory.id(changeId);
            if (!log) {
                return res.status(404).json({ error: 'Log not found' });
            }
            log = {
                ...log.toObject(),
                title: regulation.title
            };
        }

        res.json({ log });
    } catch (error) {
        console.error('Error fetching log details:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Search regulations
router.get('/api/regulations/search', isAuthenticated, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const regulations = await Regulation.find({
            isActive: true,
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { content: { $regex: query, $options: 'i' } },
                { category: { $regex: query, $options: 'i' } }
            ]
        }).populate('addedBy', 'username')
          .populate('lastModifiedBy', 'username');

        res.json({ regulations });
    } catch (error) {
        console.error('Error searching regulations:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit a disciplinary action
router.post('/api/disciplinary', isAuthenticated, async (req, res) => {
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized to issue disciplinary actions' });
    }

    try {
        const { userId, grade, reason, xpDeduction, demotionRank } = req.body;
        const targetUser = await User.findById(userId);
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Determine if action needs officer approval
        const needsApproval = grade === 4 || (grade === 3 && xpDeduction >= 10);
        
        const action = new DisciplinaryAction({
            targetUser: userId,
            issuedBy: req.user._id,
            grade,
            reason,
            xpDeduction: grade === 2 ? 1 : xpDeduction,
            demotionRank,
            status: needsApproval ? 'pending' : 'completed'
        });

        await action.save();

        // If no approval needed, process the action immediately
        if (!needsApproval) {
            await processAction(action);
        }

        res.json({ 
            success: true, 
            needsApproval,
            action
        });
    } catch (error) {
        console.error('Error submitting disciplinary action:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending disciplinary actions (for officers)
router.get('/api/disciplinary/pending', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const actions = await DisciplinaryAction.find({ status: 'pending' })
            .populate('targetUser', 'username highestRole')
            .populate('issuedBy', 'username')
            .sort('-dateIssued');
        
        res.json({ actions });
    } catch (error) {
        console.error('Error fetching pending actions:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get disciplinary logs
router.get('/api/disciplinary/logs', isAuthenticated, async (req, res) => {
    try {
        const query = req.user.isOfficer ? {} : { issuedBy: req.user._id };
        
        const actions = await DisciplinaryAction.find(query)
            .populate('targetUser', 'username highestRole')
            .populate('issuedBy', 'username')
            .populate('officerApproval.officer', 'username')
            .sort('-dateIssued');
        
        res.json({ actions });
    } catch (error) {
        console.error('Error fetching disciplinary logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single disciplinary action details
router.get('/api/disciplinary/:id', isAuthenticated, async (req, res) => {
    try {
        const action = await DisciplinaryAction.findById(req.params.id)
            .populate('targetUser', 'username highestRole')
            .populate('issuedBy', 'username')
            .populate('officerApproval.officer', 'username');
        
        if (!action) {
            return res.status(404).json({ error: 'Action not found' });
        }

        res.json({ action });
    } catch (error) {
        console.error('Error fetching action details:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Approve disciplinary action (officers only)
router.post('/api/disciplinary/:id/approve', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const action = await DisciplinaryAction.findById(req.params.id)
            .populate('targetUser');
        
        if (!action) {
            return res.status(404).json({ error: 'Action not found' });
        }

        if (action.status !== 'pending') {
            return res.status(400).json({ error: 'Action already processed' });
        }

        action.status = 'approved';
        action.officerApproval = {
            officer: req.user._id,
            date: new Date()
        };

        await action.save();
        await processAction(action);

        res.json({ success: true });
    } catch (error) {
        console.error('Error approving action:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reject disciplinary action (officers only)
router.post('/api/disciplinary/:id/reject', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ error: 'Rejection reason required' });
        }

        const action = await DisciplinaryAction.findById(req.params.id);
        if (!action) {
            return res.status(404).json({ error: 'Action not found' });
        }

        if (action.status !== 'pending') {
            return res.status(400).json({ error: 'Action already processed' });
        }

        action.status = 'rejected';
        action.officerApproval = {
            officer: req.user._id,
            date: new Date(),
            notes: reason
        };

        await action.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error rejecting action:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to process disciplinary actions
async function processAction(action) {
    try {
        const user = await User.findById(action.targetUser._id || action.targetUser);
        
        switch (action.grade) {
            case 2: // Violation (-1 XP)
            case 3: // Violation II (Custom XP)
                user.xp = Math.max(0, user.xp - action.xpDeduction);
                await user.save();
                break;
                
            case 4: // Demotion
                await handlePromotion(user.discordId, action.demotionRank);
                user.highestRole = action.demotionRank;
                await user.save();
                break;
        }
    } catch (error) {
        console.error('Error processing disciplinary action:', error);
        throw error;
    }
}

// Route to get a user's rank and Discord ID using their Roblox ID
router.get('/getUserByRobloxId/:robloxId', async (req, res) => {
    try {
        const robloxId = req.params.robloxId;
        const user = await User.findOne({ robloxId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            discordId: user.discordId,
            robloxId: user.robloxId,
            rank: user.highestRole,
            xp: user.xp
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;