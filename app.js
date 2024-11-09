const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const ExpressError = require("./utils/ExpressError");
const User = require("./models/user");
require('dotenv').config();
app.use(express.json());

const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use the app password here
  },
});



// Route Files
const listingRoutes = require("./routes/listing");
const reviewRoutes = require("./routes/review");
const userRoutes = require("./routes/user");


const  dbURL = process.env.ATLASDB_URL;

main()
  .then(() =>{
    console.log("connected to DB")
  })
   .catch((err) =>{
    console.log(err);
   });



async function main() {
    // await mongoose.connect(MONGO_URL);
    await mongoose.connect(dbURL);
}



// Set up EJS and Views Directory
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));




const store= MongoStore.create({
  mongoUrl: dbURL,
  crypto:{
    secret:process.env.SECRET,
    touchAfter:24*3600,

  }
})



store.on("error",(err)=>{
  console.log("ERROR IN MONGO SESSION STORE",err)
})


// Session and Flash Configuration
const sessionOptions = {
  store,
  secret: process.env.SESSION_SECRET || process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  }
};


app.use(session(sessionOptions));
app.use(flash());

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());
// passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Flash Messages Middleware
app.use((req, res, next) => {
  console.log(req.user);
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currUser = req.user || null;  // Set currUser to null if no user is logged in
  console.log(res.locals.currUser);
  next();
});


//sending email
const sendSignupEmail = async (user) => {
  const mailOptions = {
    from: '"FindYourStay" <no-reply@findyourstay.com>', // Replace with your "from" email
    to: user.email, // Send to the registered user's email
    subject: 'Welcome to FindYourStay!',
    text: `Hi ${user.username},\n\nWelcome to FindYourStay! We're thrilled to have you join our community of travelers and hosts.\n\nWhether you're looking for the perfect stay or planning to list your own property, we're here to make your experience seamless and enjoyable.\n\nIf you have any questions or need assistance, feel free to reach out to us anytime.\n\nHappy exploring!\n\nBest regards,\nThe FindYourStay Team`
  };

  // Send the email using Nodemailer
  await transporter.sendMail(mailOptions);
};



//google login
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://findyourstay.onrender.com/auth/google/callback"
},
async function(accessToken, refreshToken, profile, done) {
  try {
    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      // Create a new user if they don't already exist
      user = new User({
        googleId: profile.id,
        username: profile.displayName,
        email: profile.emails[0].value,
        provider: 'google'
      });
      await user.save();

      // Send welcome email
      await sendSignupEmail(user);
    }

    // Proceed with user login
    done(null, user);

  } catch (err) {
    done(err, false);
  }
}));


passport.use(new LocalStrategy(
  { usernameField: 'username', passwordField: 'password' },
  async (username, password, done) => {
    try {
      // Find user by either username or email
      const user = await User.findOne({
        $or: [{ username: username }, { email: username }]
      });

      if (!user) {
        return done(null, false, { message: 'Invalid username or email.' });
      }

      // Use the `user.authenticate` method from passport-local-mongoose
      user.authenticate(password, (err, authenticatedUser, passwordError) => {
        if (err) {
          return done(err);
        }
        if (passwordError) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, authenticatedUser);
      });
    } catch (error) {
      return done(error);
    }
  }
));


//my-account
const accountRoutes = require('./routes/account');
app.use('/', accountRoutes);

// Favicon Handling
// app.get('/favicon.ico', (req, res) => res.status(204).end());

// Routes
app.get("/", (req, res) => {
  res.redirect('/listings');  // Render a homepage template
});

app.use("/listings", listingRoutes);
app.use("/listings/:id/reviews", reviewRoutes);
app.use("/", userRoutes);

// Catch-all Route for 404 Errors
app.all("*", (req, res, next) => {
  next(new ExpressError("Page Not Found", 404));  // Create a new error with status code 404
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong!" } = err;

  res.status(statusCode).render('error', { message });
});

// Server Listener
const PORT = process.env.PORT || 8080;
const server=app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

server.setTimeout(50000);  // Adjust as needed (in ms)
server.keepAliveTimeout = 65000;