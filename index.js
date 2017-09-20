const Sharinpix = require('sharinpix');
// const secretUrl = 'sharinpix://55a77236-7167-455f-a146-ce2282906880:_EiLHGQM30s_TDPBr58cqA_cOM04yjfFitDnbB0tFLLyroU@kherin.ngrok.io/api/v1';
Sharinpix.configure(process.env.SHARINPIX_URL);
// Sharinpix.configure(secretUrl);

const sharinpixInstance = Sharinpix.get_instance();

const express = require('express');
const app = express();

if (app.settings.env === 'development') {
    require('dotenv').config();
}
const bodyParser = require('body-parser');
const parseCsvImages = require('./lib/parse-csv-images');
const parseCsv = require('./lib/csv-upload');
const fileUpload = require('express-fileupload');
const Stream = require('stream');
const unirest = require('unirest');
const jwt = require('jsonwebtoken');
const _ = require('underscore');
const uuidV4 = require('uuid/v4');
const fs = require('fs');
const jsonfile = require('jsonfile');
const morgan = require('morgan');
const date = new Date();

app.set('json spaces', 3);

// For Content-Type: application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));
// For Content-Type: application/json
app.use(bodyParser.json());
app.use(fileUpload());
app.use(morgan(':remote-addr | :method :url :status :res[content-length] bytes - :response-time ms'));

app.get('/', function(req, res) {
    res.sendFile('views/index.html', {root: __dirname});
});

app.post('/webhook', function (req, res) {
    return;
    let payload = JSON.parse(req.body.p);
    if (!payload.metadatas || !payload.metadatas.filepath || !payload.metadatas.externalId) {
        return res.send({
            success: false,
            message: 'Appropriate metadatas not found, request ignored.'
        });
    }
    let filepath = payload.metadatas.filepath;
    let externalId = payload.metadatas.externalId;
    let imageId = payload.public_id;
    let imageWidth = payload.width;
    let imageHeight = payload.height;
    let albumId = payload.album.public_id;
    let abilities = {};
    var startTime, endTime;
    abilities[albumId] = {
        Access: {
            einstein_box: true
        }
    };
    
    jsonfile.readFile(filepath, function(err, images) {
        let image = images[externalId];
        let imageAttributesPair = _.pairs(image.otherAttributes);
        for (let attribute of imageAttributesPair) {
            let enteredOnce = false;
            (function(attribute){
                if (/^box\d+$/.test(attribute[0]) && typeof attribute[1] === 'object') {
                    enteredOnce = true;
                    let box = attribute[1];
                    let label = box.label;
                    let percentageWidth = (box.width / imageWidth) * 100;
                    let percentageHeight = (box.height / imageHeight) * 100;
                    let percentageX = (box.x / imageWidth) * 100;
                    let percentageY = (box.y / imageHeight) * 100;
                    startTime = process.hrtime();
                    unirest.post(`https://${process.env.ENDPOINT_DOMAIN}/api/v1/images/${imageId}/einstein_box`).headers({
                        'Content-Type': 'application/json',
                        'Authorization': `Token token="${token}"`
                    }).send({
                        label: label,
                        width: percentageWidth,
                        height: percentageHeight,
                        top: percentageY,
                        left: percentageX
                    }).end(function(response){
                        console.log('End time', process.hrtime()[0]-startTime[0]);
                        if (imageAttributesPair[imageAttributesPair.length - 1] === attribute) {
                            let csvJson = jsonfile.readFileSync(filepath);
                            csvJson[externalId].webhookCompleted = true;
                            jsonfile.writeFileSync(filepath, csvJson);
                        }
                        console.log('done');
                    });
                }
            })(attribute)
            if (!enteredOnce && imageAttributesPair[imageAttributesPair.length - 1] === attribute) {
                let csvJson = jsonfile.readFileSync(filepath);
                csvJson[externalId].webhookCompleted = true;
                jsonfile.writeFileSync(filepath, csvJson);
            }
        }
    });
    res.send('Ok');
});

app.post('/upload-csv', function(req, res) {
    if (!req.files)
        return res.status(400).send('No files were uploaded.');
    
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file 
    let csvFile = req.files.csvFile;
    let albumId = req.body.albumId;
    
    let bufferStream = new Stream.PassThrough();
    bufferStream.end(csvFile.data);
    // let csvJsonId = uuidV4();
    let utcdate = ("0" + date.getUTCDate()).slice(-2);
    let month =   ("0" + date.getMonth()).slice(-2);
    let csvJsonId = date.getFullYear()+'-'+month+'-'+utcdate+'-'+date.getHours()+date.getMinutes()+date.getSeconds();
    let outputFilePath = `${__dirname}/csv-jsons/${csvJsonId}.json`;
    if (!fs.existsSync(`${__dirname}/csv-jsons`)) {
        fs.mkdirSync(`${__dirname}/csv-jsons`);
    }
    parseCsv(albumId, bufferStream, outputFilePath, sharinpixInstance);
    res.redirect(`/status/${csvJsonId}`);
});

app.get('/status/:csvJsonId', function(req, res) {
    let csvJsonId = req.params.csvJsonId;
    if (fs.existsSync(`${__dirname}/csv-jsons/${csvJsonId}.json`)) {
        let csvJson = jsonfile.readFileSync(`${__dirname}/csv-jsons/${csvJsonId}.json`);
        let csvJsonPairs = _.pairs(csvJson);
        let response = {};
        for (let csvJsonPair of csvJsonPairs) {
            response[csvJsonPair[1].name] = {
                sentForUpload: csvJsonPair[1].sentForUpload ? true : false,
                webhookCompleted: csvJsonPair[1].webhookCompleted ? true : false
            }
        }
        res.json(response);
    } else {
        res.json({
            success: false,
            message: 'File does not exists'
        });
    }
});

app.use(function(req, res) {
    res.status(404);
    res.send('404 - Not found');
});

 app.listen(process.env.PORT, function () {
    console.log(`Example app listening on port ${process.env.PORT}`);
});
