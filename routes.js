const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const passport = require('passport');
const { User } = require('./models/user');

// Authentication middleware
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
    res.render('login', { 
        title: 'Login',
        error: req.flash('error')
    });
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
            setSessionRoles(req);
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
            path: req.path  // Add the path variable
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Similarly for other routes
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

module.exports = router;