/* global app */
var express = require('express');
var router = express.Router();
var Multer = require('multer');
var nodemailer = require('nodemailer');
var randtoken = require('rand-token');
var fs = require('fs');

/* GET current leaderboard */
router.get('/', function(req, res, next) {
  res.render('leaderboard', { mobilityRanking: app.ranking.mobilityItems.sort(app.ranking.ascSort), 
                              localeRanking:app.ranking.localeItems.sort(app.ranking.ascSort)
  });
});


/* GET registration page (requesting a token) */
router.get('/register', function(req, res, next) {
  res.render('register');
});

/* GET registration token: 
  1. check whether the information is valid (and does not yet exst in teh user data)
  2. send a registration email with the necessary token
 */
router.get('/receiveToken', function(req, res, next) {

  var teamName = req.query.teamName;
  var email = req.query.email;
  
  console.log('Registration request received from ' + email + ' (team )'+teamName);
  
  //alphanumeric chars and underscore are allowed in the team name
  //min. 3, max. 15 characters
  var re1 = /^[A-Za-z0-9_]{3,15}/;
  
  //validation
  if(app.ranking.teamNameExists(teamName) === true ) {
      res.render('error', { message:'Team registration unsuccessful: this team name is already registered.' });
  }
  else if( ! re1.test(teamName)) {
    res.render('error', {   message:'Team registration unsuccessful: the team name is invalid.' });
  }
//multiple tokens can be requested by the same participant  
//  else if(app.ranking.emailExists(email) === true ) {
//      res.render('error', { message:'Team registration unsuccessful: this email adres is already registered.' });
//  }
  else {
    //regex copy & pasted from elsewhere; not checked in depth, whether it works as advertised
    var re2 = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
    if( ! re2.test(email)) {
      res.render('error', { message:'Team registration unsuccessful: the email adres is invalid.' });
    }
    //generate token and send an email
    else {
      var randomToken = 0;
      do {
        randomToken = randtoken.generate(10);
      } while( app.ranking.tokenExists(randomToken));

      //build the message
      var emailMessage = app.config["registration-mail-text"].join(" ");
      emailMessage = emailMessage.replace(/RANDOM_TOKEN/,randomToken).replace(/TEAM_NAME/, String(teamName));

      //highly inefficient code, move out to instantiate once
      var transporter = nodemailer.createTransport({
      service: app.config["email-service"],
      auth: {
          user: app.config["email-account"],
          pass: app.config["email-password"],
            }
      });
      transporter.sendMail({
          from: app.config["email-account"],
          to: email,
          subject: app.config["registration-mail-subject"],
          text: emailMessage
        }, 
        function(error, info){
          if(error){
            console.log(error);
          }else{
            console.log('Registration email sent: ' + info.response);
          }
      });
      var success = app.ranking.addItem(randomToken, teamName, email);
      if(success === true) {
        res.render('success', { message:'You should receive an email from ' + app.config["email-account"] +' within a few minutes.' });
      }
      else {
        //something went wrong
        res.render('error', {   message:'Team registration failed: please try again to register in a few minutes.' });
      }
    }
  }
});


/* GET submisson page (submitting a run) */
router.get('/submit', function(req,res,next) {
  res.render('submit');
});


/* submitted runs are sent by POST */
/* post-upload validation checks mean that useless uploads might occur (needs fixing) */
router.post('/runSubmission', Multer(
    
  { 
    dest: './uploads/',
    
    //req.body is not fully parsed in all likelihood ...
    rename: function (fieldname, filename, req, res) {
      var token = req.body.token;
      var date = new Date();
      return date + '.' + token;
    },

    onFileUploadComplete: function (file, req, res) {

      //req.body is fully parsed
      var token = req.body.token;
      var evalType = req.body.evalType;

      //once the upload is complete, check whether the run is valid
      //and if so, compute the prediction accuracy
      var currentTime = new Date().getTime();
      var lastSubmission = app.ranking.getLastSubmissionDate(token, evalType);
      var waitMilliseconds = Number(app.config["milliseconds-between-uploads"]);
      var waitMinutes = waitMilliseconds/(1000 * 60);

      if(lastSubmission !== null) {
        lastSubmission = new Date(lastSubmission).getTime();
      }
      if(app.ranking.tokenExists(token) === false) {
        res.render('error', { message:'Run upload failed: your token ' + token + ' is not valid.' });
      }
      else if( lastSubmission !== null && Math.abs(currentTime - lastSubmission) < waitMilliseconds) {
        var errorMsg = "Run upload failed: you have to wait at least "+waitMinutes+" minutes between subsequent submissions.";
        res.render('error', { message: errorMsg });         
      }
      else {
        res.render('success', { message:'The upload was successful. It may take a few minutes until your new score appears on the leaderboard.' });
        //rename the file and then compute the error
        var filename = file.path + '_' + req.body.token + '_' + req.body.evalType;
        fs.rename(file.path, filename, function (err) {
          if (err) {
            throw err;
          }
          setTimeout(
            app.geoAccuracy.computeError(req.body.token, filename, evalType), 0
            );
        });
      }
    }
  }
  )
);


module.exports = router;
