const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const passport = require('passport');
const { User } = require('./models/user');
const { Promotion } = require('./models/promotion');
const { Demotion } = require('./models/demotion');
const { Training } = require('./models/training');
const Division = require('./models/division');
const Recruitment = require('./models/recruitment');
const { Regulation } = require('./models/regulation');
const { DisciplinaryAction } = require('./models/disciplinary');
const { handlePromotion } = require('./bot')

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
        const user = await User.findById(req.user.id).exec();
        res.render('profile', {
            title: 'Profile',
            user: user,
            path: req.path
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).send('Error loading profile');
    }
});

// Members route
router.get('/members', isAuthenticated, async (req, res) => {
    try {
        const users = await User.find({}).sort({ highestRole: -1 }).exec();
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

router.get('/forms', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).exec();
        res.render('forms', {
            title: 'Forms',
            user: user,
            path: req.path
        });
    } catch (error) {
        console.error('Forms error:', error);
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
router.post('/api/trainings', isAuthenticated, async (req, res) => {
    if (!req.user.isInstructor) {
        return res.status(403).json({ error: 'Only instructors can submit trainings' });
    }

    try {
        const { usernames, type, xpAmount } = req.body;
        
        // Find all trainees
        const trainees = await User.find({ username: { $in: usernames } });
        if (trainees.length !== usernames.length) {
            return res.status(400).json({ error: 'Some usernames not found' });
        }

        // For Basic Training, verify trainees are citizens
        if (type === 'Basic Training') {
            const nonCitizens = trainees.filter(t => t.highestRole !== 'Citizen');
            if (nonCitizens.length > 0) {
                return res.status(400).json({ 
                    error: 'Basic Training is only for citizens' 
                });
            }
        }

        const needsApproval = xpAmount >= 10;
        const training = new Training({
            trainees: trainees.map(t => t._id),
            instructor: req.user._id,
            type,
            xpAmount,
            needsApproval,
            status: needsApproval ? 'pending' : 'approved'
        });

        await training.save();

        // If no approval needed, update XP immediately
        if (!needsApproval) {
            for (const trainee of trainees) {
                trainee.xp += xpAmount;
                await trainee.save();
            }
            training.processed = true;
            await training.save();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Training submission error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending trainings
router.get('/api/trainings/pending', isAuthenticated, async (req, res) => {
    console.log('Checking user roles:', {
        isSenior: req.user.isSenior,
        isOfficer: req.user.isOfficer
    });

    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const query = { 
            $or: [
                { status: 'pending' },
                { status: 'bumped_back' }
            ]
        };

        console.log('Query being used:', query);

        const trainings = await Training.find(query)
            .populate('trainees instructor')
            .sort({ createdAt: -1 });

        console.log('Found trainings:', {
            count: trainings.length,
            trainings: trainings.map(t => ({
                id: t._id,
                status: t.status,
                needsApproval: t.needsApproval,
                type: t.type
            }))
        });

        res.json({ 
            trainings: trainings,
            user: {
                isSenior: req.user.isSenior,
                isOfficer: req.user.isOfficer
            }
        });
    } catch (error) {
        console.error('Error fetching pending trainings:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get training logs
router.get('/api/trainings/logs', isAuthenticated, async (req, res) => {
    try {
        let query = {};
        switch (req.query.filter) {
            case 'bumped':
                query.status = { $in: ['bumped_up', 'bumped_back'] };
                break;
            case 'approved':
                query.status = 'approved';
                break;
            case 'rejected':
                query.status = 'rejected';
                break;
        }

        const trainings = await Training.find(query)
            .populate('trainees instructor')
            .sort({ createdAt: -1 });

        res.json({ trainings });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Training actions (approve, reject, bump)
router.post('/api/trainings/:id/:action', isAuthenticated, async (req, res) => {
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const training = await Training.findById(req.params.id)
            .populate('trainees');
        
        if (!training) {
            return res.status(404).json({ error: 'Training not found' });
        }

        switch (req.params.action) {
            case 'approve':
                training.status = 'approved';
                // Update XP for all trainees
                for (const trainee of training.trainees) {
                    trainee.xp += training.xpAmount;
                    await trainee.save();
                }
                training.processed = true;
                break;

            case 'reject':
                training.status = 'rejected';
                training.rejectReason = req.body.reason;
                break;

            case 'bump_up':
                if (!req.user.isSenior) {
                    return res.status(403).json({ error: 'Not authorized to bump up' });
                }
                training.status = 'bumped_up';
                break;

            case 'bump_back':
                if (!req.user.isOfficer) {
                    return res.status(403).json({ error: 'Not authorized to bump back' });
                }
                training.status = 'bumped_back';
                break;

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        training.approvalChain.push({
            approver: req.user._id,
            action: req.params.action,
            reason: req.body.reason
        });

        await training.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Training action error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get training details
router.get('/api/trainings/:id', isAuthenticated, async (req, res) => {
    try {
        const training = await Training.findById(req.params.id)
            .populate('trainees instructor')
            .populate('approvalChain.approver');

        if (!training) {
            return res.status(404).json({ error: 'Training not found' });
        }

        res.json({
            training: training,
            user: {
                isSenior: req.user.isSenior,
                isOfficer: req.user.isOfficer
            }
        });
    } catch (error) {
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

// Get all divisions
router.get('/api/divisions', isAuthenticated, async (req, res) => {
    try {
        const divisions = await Division.find({})
            .populate('parentDivision', 'name')
            .populate('personnel.user', 'username')
            .exec();
        
        res.json({ divisions: divisions || [] }); // Ensure we always send an array
    } catch (error) {
        console.error('Error fetching divisions:', error);
        res.status(500).json({ error: 'Server error', divisions: [] });
    }
});

// Create division
router.post('/api/cdivision', isAuthenticated, async (req, res) => {
    try {
        const { name, parentDivisionId } = req.body;
        const division = new Division({
            name,
            parentDivision: parentDivisionId || null
        });
        await division.save();
        res.json({ success: true, division });
    } catch (error) {
        console.error('Error creating division:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add personnel to a division
router.post('/api/divisions/:divisionId/personnel', isAuthenticated, async (req, res) => {
    try {
        const { userId, position } = req.body;
        const division = await Division.findById(req.params.divisionId);
        
        if (!division) {
            return res.status(404).json({ error: 'Division not found' });
        }

        // Check if user is already in any division
        const userInDivision = await Division.findOne({
            'personnel.user': userId
        });

        if (userInDivision) {
            return res.status(400).json({ error: 'User is already assigned to a division' });
        }

        division.personnel.push({
            user: userId,
            position
        });

        await division.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding personnel:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove personnel from division
router.delete('/api/divisions/:divisionId/personnel/:userId', isAuthenticated, async (req, res) => {
    try {
        const division = await Division.findById(req.params.divisionId);
        if (!division) {
            return res.status(404).json({ error: 'Division not found' });
        }

        division.personnel = division.personnel.filter(
            p => p.user.toString() !== req.params.userId
        );

        await division.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing personnel:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Get division hierarchy (returns tree structure)
router.get('/api/divisions/hierarchy', async (req, res) => {
    try {
        // First get all divisions
        const divisions = await Division.find({}).populate('parentDivision').exec();
        
        // Helper function to build tree
        function buildHierarchy(divisions, parentId = null) {
            return divisions
                .filter(division => 
                    parentId === null 
                        ? !division.parentDivision
                        : division.parentDivision?._id.toString() === parentId.toString()
                )
                .map(division => ({
                    ...division.toObject(),
                    children: buildHierarchy(divisions, division._id)
                }));
        }

        const hierarchy = buildHierarchy(divisions);
        res.json({ hierarchy });

    } catch (error) {
        console.error('Error fetching division hierarchy:', error);
        res.status(500).json({ error: 'Failed to fetch division hierarchy' });
    }
});

// Delete a division (only if it has no children)
router.delete('/api/divisions/:id', isAuthenticated, async (req, res) => {
    try {
        // Check for child divisions
        const hasChildren = await Division.exists({ parentDivision: req.params.id });
        if (hasChildren) {
            return res.status(400).json({ 
                error: 'Cannot delete division with child divisions. Please delete child divisions first.' 
            });
        }

        await Division.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting division:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/api/recruitment', isAuthenticated, async (req, res) => {
    if (!req.user.isRecruiter && !req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const recruitment = new Recruitment({
            ...req.body,
            recruiter: req.user._id,
            status: 'pending'
        });
        await recruitment.save();
        res.json({ success: true, recruitment });
    } catch (error) {
        console.error('Recruitment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/api/recruitment/pending', isAuthenticated, async (req, res) => {
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const query = req.user.isSenior ? 
            { status: 'pending' } : 
            { status: 'rejected_appealed' };

        const recruitments = await Recruitment.find(query)
            .populate('recruiter', 'username')
            .populate('targetDivision', 'name')
            .sort('-createdAt');

        res.json({ recruitments });
    } catch (error) {
        console.error('Error fetching pending recruitments:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/api/recruitment/:id/review', isAuthenticated, async (req, res) => {
    // Check authentication level
    if (!req.user.isSenior && !req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        // Fetch recruitment data
        const recruitment = await Recruitment.findById(req.params.id)
            .populate('targetDivision')
            .populate('recruiter', 'username');

        if (!recruitment) {
            return res.status(404).json({ error: 'Recruitment not found' });
        }

        // Destructure request payload
        const { action, notes, type } = req.body;
        console.log('Review request received:', { action, notes, type });

        // Officer logic
        if (req.user.isOfficer) {
            switch (action) {
                case 'veto': {
                    const proposedDivision = await Division.findById(recruitment.targetDivision._id);
                    const user = await User.findOne({ username: recruitment.recruitUsername });

                    if (!user) {
                        return res.status(400).json({ error: 'Recruit user not found' });
                    }

                    proposedDivision.personnel.push({
                        user: user._id,
                        position: recruitment.divisionPosition
                    });
                    await proposedDivision.save();

                    recruitment.status = 'approved';
                    recruitment.officerReviewNotes = notes || 'Vetoed and placed in proposed division';
                    recruitment.officerReviewedBy = req.user._id;
                    await recruitment.save();
                    return res.json({ success: true });
                }

                case 'accept_rejection': {
                    const newDivision = await Division.findById(req.body.newDivisionId);
                    if (!newDivision) {
                        return res.status(404).json({ error: 'Selected division not found' });
                    }

                    const recruitUser = await User.findOne({ username: recruitment.recruitUsername });
                    if (!recruitUser) {
                        return res.status(400).json({ error: 'Recruit user not found' });
                    }

                    newDivision.personnel.push({
                        user: recruitUser._id,
                        position: recruitment.divisionPosition
                    });
                    await newDivision.save();

                    recruitment.status = 'approved';
                    recruitment.targetDivision = newDivision._id;
                    recruitment.officerReviewNotes = notes || 'Approved with new division placement';
                    recruitment.officerReviewedBy = req.user._id;
                    await recruitment.save();
                    return res.json({ success: true });
                }

                case 'final_reject': {
                    recruitment.status = 'final_rejected';
                    recruitment.officerReviewNotes = notes || 'Recruitment fully rejected';
                    recruitment.officerReviewedBy = req.user._id;
                    await recruitment.save();
                    return res.json({ success: true });
                }

                default:
                    return res.status(400).json({ error: 'Invalid action' });
            }
        }

        // SNCO logic
        if (req.user.isSenior && type === 'snco') {
            console.log('Processing SNCO review with action:', action);

            if (action === 'approve') {
                const targetDivision = await Division.findById(recruitment.targetDivision._id);
                const user = await User.findOne({ username: recruitment.recruitUsername });

                if (!targetDivision || !user) {
                    return res.status(400).json({
                        error: !targetDivision ? 'Target division not found' : 'Recruit user not found'
                    });
                }

                targetDivision.personnel.push({
                    user: user._id,
                    position: recruitment.divisionPosition
                });
                await targetDivision.save();

                recruitment.status = 'approved';
                recruitment.sncoReviewNotes = notes || 'Approved by SNCO';
                recruitment.sncoReviewedBy = req.user._id;
                await recruitment.save();

                return res.json({
                    success: true,
                    message: 'Placement approved successfully'
                });
            }

            if (action === 'reject') {
                recruitment.status = 'rejected_appealed';
                recruitment.sncoReviewNotes = notes || 'Rejected by SNCO';
                recruitment.sncoReviewedBy = req.user._id;
                await recruitment.save();

                return res.json({
                    success: true,
                    message: 'Placement rejected successfully'
                });
            }

            return res.status(400).json({
                error: `Invalid SNCO review action: ${action}. Must be 'approve' or 'reject'.`
            });
        }

        return res.status(400).json({ error: 'Invalid request' });
    } catch (error) {
        console.error('Review error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/api/recruitment/rejected', isAuthenticated, async (req, res) => {
    if (!req.user.isOfficer) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    try {
        const recruitments = await Recruitment.find({ status: 'rejected_appealed' })
            .populate('targetDivision')
            .populate('recruiter', 'username')
            .populate('reviewedBy', 'username')
            .sort('-createdAt');

        res.json({ recruitments });
    } catch (error) {
        console.error('Error fetching rejected recruitments:', error);
        res.status(500).json({ error: 'Server error' });
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

module.exports = router;