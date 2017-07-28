const 
  argv      = require('yargs')                                        // manage command line arguments
    .require('credentials')                                           // require the argument credentials
    .argv,                                                            // return out the command line arguments
  express   = require('express'),                                     // Web server framework
  redis     = require('redis'),                                       // node_redis module
  rk        = require('rk'),                                          // redis key builder
  creds     = require(argv.credentials),                              // the credentials argument on the command line is the path
                                                                      // to the node_redis connection object in JSON
  app       = express(),                                              // init the web server
  
  client    = redis.createClient(creds),                              // create the connection with the `required` connection object JSON

  keyRoot   = '{deals}',                                              // all keys start with this, using curly braces for Redis Enterprise hash slots
  popKey    = 'pop',                                                  // popularity key part
  activeKey = 'active',                                               // active key part
  countEpoch
            = new Date(2017,6,1),                                     // we're starting from July 1, 2017 - could be any date in the past
  hotThreshold
            = 3;                                                      // An item is "hot" after minutes of activity, could be any number

require('date-utils');                                                // facilitates JS date subtraction - modifies the Date object

function getItemInfo(id,campaign,cb) {                                // Abstracted item info function
  var
      badgeMulti  = client.multi();                                   // Using a multi for less round trips and atomicity
    
    badgeMulti.zrevrange(                                             // Get the most popular item in the zset
      rk(keyRoot,campaign,popKey),
      0,
      0
    )
    .bitcount(                                              // Count the number of 1's in the last 3 bytes
      rk(keyRoot,activeKey,campaign,id),
      -3,
      -1
    )
    .exec(                                                            // fire off the multi
      function(err,results) {
        var
          mostPopular,
          hotCount;

        if (err) { cb(err); } else {                                  // error handling
          mostPopular = results[0][0];                                // clarify the bulk reply result
          hotCount = results[1];                                      // ditto
          cb(err,mostPopular,hotCount);                               // return back the information in a callback
        }
      }
    );

}
                                                                      // This is for debugging and not used in production
app.get(                                                              // HTTP GET Route
  '/info/:camp/:id',                                                  // the URL with campaign and id
  function(req,res,next) {                                            // Express callback signature (req)est,(res)ponse and next callback
    getItemInfo(
      req.params.id,                                                  // the id from the URL
      req.params.camp,                                                // the campaign from the URL
      function(err,mostPopular,hotCount) {                            // callback
        if (err) { next(err); } else {                                // error handling
          res.send(                                                   // send this data
            'pop: '+mostPopular+', hotcount: '+hotCount               // just as a simple string
          );
        }
      }
    );
  }
);

                                                                      // This is the badge Image URL
app.get(                                                              // HTTP GET Route
  '/badge/:camp/:id/:unique',                                         // the url with the campaign, id and a unique value (not used but for cache busting)
  function(req,res,next) {                                            // Express callback signature (req)est,(res)ponse and next callback
    getItemInfo(
      req.params.id,                                                  // the id from the URL
      req.params.camp,                                                // the campaign from the URL
      function(err,mostPopular,hotCount) {
        if (err) { next(err); } else {                                // error handling
          if (mostPopular === req.params.id) {                        // only one popular item per campaign, so it takes precidence over hotness
            res.redirect(307, '/pop.png');                            // HTTP 307 Temporary Redirect to the pop.png file
          } else if (hotCount >= hotThreshold) {                      // multiple hot items are possible
            res.redirect(307, '/hot.png');                            // HTTP 307 Temporary Redirect to the hot.png file
          } else {                                                    // otherwise
            res.redirect(307, '/empty.png');                          // HTTP 307 to the empty image.
          }
        }
      }
    );
  }
);

                                                                      // This is the "link" URL
app.get(                                                              // HTTP GET Route
  '/fwd/:camp/:id',                                                   // the url with the campaign and id
  function(req,res,next) {                                            // Express callback signature (req)est,(res)ponse and next callback
    var
      recordingMulti  = client.multi();                               // Using a multi for less round trips and atomicity
    
    recordingMulti
      .zincrby(                                                       // increment the score of a zset memeber
        rk(keyRoot,req.params.camp,popKey),                           // the popularity leaderboard - a key something like {deals}:pop:august17
        1,                                                            // increment by 1
        req.params.id                                                 // for the item being clicked
      )
      .setbit(                                                        // set a single bit in a key value
        rk(keyRoot,activeKey,req.params.camp,req.params.id),          // a key something like {deals}:august17:watch
        countEpoch.getMinutesBetween(new Date()),                     // the number of minutes since our fixed offset
        1                                                             // set it to a 1 not a 0
      );
    
    recordingMulti.exec(                                              // run the multi
      function(err) {                                                 // we don't need the results here, so just an `err`
        if (err) { next(err); } else {                                // error handling
          res.send(                                                   // here we are just sending out some text
            'Deal with '+req.params.id+' <a href="/">Back</a>'        // Normally you would do a redirect to your actual page
          );                                                          // but for sake of simpilicty, we're just showing the text
        }
      }
    );
  }
); 

app
  .use(express.static('static'))                                      // serve some static files - images and the example HTML
  .listen(5599, function () {                                         // Start the server
    console.log('ready');                                             // log that we're ready
  }
);