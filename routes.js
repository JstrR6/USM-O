const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');  // Changed from bcryptjs to bcrypt
const passport = require('passport');
const flash = require('connect-flash');  // Added connect-flash
const { User } = require('./models/user');

// Helper function to set session roles
function setSessionRoles(req) {
    if (req.user) {
        req.session.isRecruiter = req.user.isRecruiter;
        req.session.isInstructor = req.user.isInstructor;
        req.session.isSenior = req.user.isSenior;
        req.session.isOfficer = req.user.isOfficer;
    }
}

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
    res.render('login', { 
        title: 'Login',
        messages: req.flash('error') // Added flash messages
    });
});

router.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username }).exec();  // Added .exec()
        if (!user) {
            req.flash('error', 'Username not found');  // Using flash for error messages
            return res.redirect('/login');
        }
        if (!user.password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
            await user.save();
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash('error', 'Incorrect password');  // Using flash for error messages
            return res.redirect('/login');
        }
        req.login(user, (err) => {
            if (err) return next(err);
            setSessionRoles(req);
            return res.redirect('/dashboard');
        });
    } catch (err) {
        console.error('Login error:', err);
        req.flash('error', 'An error occurred during login');  // Using flash for error messages
        return res.redirect('/login');
    }
});

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.flash('success', 'Successfully logged out');  // Added logout message
        res.redirect('/login');
    });
});

router.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', {
        title: 'Dashboard',
        user: req.user,
        messages: req.flash()  // Added flash messages to dashboard
    });
});

module.exports = router;