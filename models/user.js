const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true, // Ensures username is unique
    },
    email: {
        type: String,
        required: true,
        unique: true, // Ensures email is unique
    },
    googleId: {
        type: String,
        unique: true, // Ensures googleId is unique for Google OAuth users
        sparse: true // Allow googleId to be null for users who sign up locally
    },
    provider: {
        type: String,
        default: 'local' // 'local' for local signup, 'google' for Google OAuth
    }
});

// Middleware to remove user reviews when the user is deleted
userSchema.pre('remove', async function(next) {
    await Listing.updateMany({ owner: this._id }, { $unset: { owner: 1 } }); // Unset the owner field in the listings
    await Review.deleteMany({ author: this._id }); // Delete reviews created by this user
    next();
});

userSchema.pre('remove', async function(next) {
    await Review.deleteMany({ author: this._id }); // Delete all reviews by the deleted user
    next();
});



// Plugin for passport-local-mongoose, using 'username' as the field for authentication
userSchema.plugin(passportLocalMongoose, { usernameField: 'username' });

module.exports = mongoose.model('User', userSchema);
