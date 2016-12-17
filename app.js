var express = require("express");
var path = require("path");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var protobuf = require('protocol-buffers');
var fs = require('fs');
var request = require("request");
var crypto = require('crypto');
var Promise = require('promise');
var ObjectID = mongodb.ObjectID;

var ISSUE_COLLECTION = "espresso";
var ADVERT_COLLECTION = "issue";
var TV_COLLECTION = "issue";

var app = express();
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());

// Create a database variable outside of the database connection callback to reuse the connection pool in your app.
var db;

// Connect to the database before starting the application server.
mongodb.MongoClient.connect("mongodb://localhost:27017/espresso" , function (err, database) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  // Save database object from the callback for reuse.
  db = database;

  console.log("Database connection ready");

  // Initialize the app.
  var server = app.listen(8080, '0.0.0.0', function () {
    var port = server.address().port;
    console.log("App now running on port", port);
  });
});

app.get("/api/:region/json", function(req, res) {
    var regionName = req.params.region.toUpperCase();
    var issue_checksum = req.get("issue_checksum");
    var issue_date = req.get("issue_date");

    db.collection("checksum").find({date: issue_date , region : regionName}).limit(1).toArray(function(err , items){
        console.log(items);
        if (items[0]["hash"].toString().trim() === issue_checksum) {
            console.log("nothing to update");
            res.json("nothing to update");
            return;
        } else {
            var manifest = req.get("manifest");
            if(typeof manifest != 'undefined'){
                var type = "manifest";
                db.collection(type).find({region: regionName}).limit(7).toArray(function(err , items){
                    var jsonVariable = {};
                    jsonVariable[type] = items;
                    res.json(jsonVariable);
                });
            }
            var issue_date = req.get("issue_date");
            if(typeof issue_date != 'undefined'){
                var type = "issue";
                db.collection(type).find({region: regionName}).limit(7).toArray(function(err , items){
                    var jsonVariable = {};
                    jsonVariable[type] = items;
                    res.json(jsonVariable);
                });
            }
        }
    });    
});


app.get("/api/update/:region", function(req, res) {
    var regionName = req.params.region;
    ragionName = regionName.toUpperCase();
    var manifestUrl = "http://cms.espresso.economist.com/api/v1/issue/" + regionName + "/json";
    db.collection("manifest").remove({region : regionName});
    var issues = {};
    request({
        url: manifestUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            // Print the json response
            for(var i = 0; i < body.length; i++){
                //console.log(requestUrl[j]);
                body[i]["region"] = regionName;
                var updatedDate = body[i]["updatedDate"];
                var issueDate = body[i]["issueDate"];
                if(typeof updatedDate !== "undefined"){
                    body[i]["checksum"] = crypto.createHash('md5').update(updatedDate).digest("hex");
                    var jsonVariable = {};
                    jsonVariable["region"] = regionName;
                    jsonVariable["date"] = issueDate;
                    jsonVariable["hash"] = body[i]["checksum"];
                    issues[i] = body[i]["checksum"]["jsonUri"];
                    db.collection("checksum").remove({date : issueDate , region : regionName});
                    db.collection("checksum").insert(jsonVariable , function(err, result) {
                        if(!err){
                            console.log("Inserted a checksum "+ jsonVariable["hash"] + "into the manifest collection.");
                            res.end('ok');
                        } else {
                            console.log(err);
                            res.end('something happened');
                        }
                    });
                }
                //console.log(body);
                db.collection("manifest").insert(body[i] , function(err, result) {
                    if(!err){
                        console.log("Inserted manifest into the manifest collection.");
                        res.end('ok');
                    } else {
                        console.log(err);
                        res.end('something happened');
                    }
                });
            }
            
        }
    });
    
});