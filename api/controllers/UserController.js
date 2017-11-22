/**
 * UserController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

var Passwords = require('machinepack-passwords');

module.exports = {

    login: async function(req, res) {
        await User.findOne({
            where: {
                username: req.param('username')
            }
        }).populate('servers').exec(function foundUser(err, createdUser) {
            if (err) { return res.send(`Error finding a user in DB ${err}`); }
            if (!createdUser) { return res.notFound(); }

            Passwords.checkPassword({
                passwordAttempt: req.param('password'),
                encryptedPassword: createdUser.encryptedPassword
            }).exec({
                error: function(err) {
                    return res.send(`Error during log in: ${err}`);
                },

                incorrect: function() {
                    return res.send('Incorrect!');
                },

                success: function() {

                    if (createdUser.banned) {
                        return res.forbidden('Your account has been banned');
                    }

                    req.session.userId = createdUser.id;

                    let userServers = createdUser.servers;
                    userServers.map(function(server) {
                        delete server.authToken;
                        delete server.telnetPassword;
                    });
                    req.session.servers = userServers;


                    return res.view('homepage');

                }
            });
        });
    },




    logout: function(req, res) {

        User.findOne({ where: { id: req.session.userId } }, function foundUser(err, user) {
            if (err) { return res.negotiate(err); }
            if (!user) {
                sails.log.verbose('Session refers to a user who no longer exists.');
                return res.redirect('/');
            }

            // log the user-agent out.
            delete req.session.userId;

            return res.view('homepage');
        });
    },

    register: function(req, res) {
        sails.log(`Registering a new user: ${req.param('username')} and password length: ${req.param('password').length}`)
        if (_.isUndefined(req.param('password'))) {
            return res.badRequest('A password is required!');
        }

        if (req.param('password').length < 6) {
            return res.badRequest('Password must be at least 6 characters!');
        }

        if (_.isUndefined(req.param('username'))) {
            return res.badRequest('A username is required!');
        }

        // username must be at least 4 characters
        if (req.param('username').length < 4) {
            return res.badRequest('Username must be at least 4 characters!');
        }

        // Username must contain only numbers and letters.
        if (!_.isString(req.param('username')) || req.param('username').match(/[^a-z0-9]/i)) {
            return res.badRequest('Invalid username: must consist of numbers and letters only.');
        }


        // Validation of input is ok, we start creating the user
        Passwords.encryptPassword({
            password: req.param('password'),
        }).exec({

            error: function(err) {
                return res.serverError(err);
            },

            success: function(result) {
                var options = {};
                options.username = req.param('username');
                options.encryptedPassword = result;

                User.create(options).meta({ fetch: true }).exec(function(err, createdUser) {
                    // Check for duplicate username
                    if (err && err.code === 'E_UNIQUE') {

                        return res.status(409).send('Username is already taken by another user, please try again.');
                    }

                    // Log the user in
                    req.session.userId = createdUser.id;
                    req.session.servers = false;
                    return res.view('welcome', {
                        userName: createdUser.username
                    });
                });
            },


        });
    },

};