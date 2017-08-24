require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const parseCsvImages = require('./lib/parse-csv-images');
const fileUpload = require('express-fileupload');
const Stream = require('stream');
const unirest = require('unirest');
const jwt = require('jsonwebtoken');
const _ = require('underscore');
const uuidV4 = require('uuid/v4');
const fs = require('fs');
const jsonfile = require('jsonfile');

// For Content-Type: application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// For Content-Type: application/json
app.use(bodyParser.json())

app.use(fileUpload());

app.get('/', function(req, res) {
    res.sendFile('views/index.html', {root: __dirname});
});

app.post('/webhook', function (req, res) {
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
    abilities[albumId] = {
        Access: {
            einstein_box: true
        }
    };
    let token = jwt.sign({
        abilities: abilities,
        iss: process.env.SHARINPIX_SECRET_ID
    }, process.env.SHARINPIX_SECRET);
    jsonfile.readFile(filepath, function(err, images) {
        console.log(images);
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
    let csvJsonId = uuidV4();
    let outputFilePath = `${__dirname}/csv-jsons/${csvJsonId}.csv`;
    if (!fs.existsSync(`${__dirname}/csv-jsons`)) {
        fs.mkdirSync(`${__dirname}/csv-jsons`);
    }
    parseCsvImages(bufferStream, outputFilePath, function(imagesHash) {
        let images = _.map(imagesHash, function(image, externalId) {
            image['externalId'] = externalId;
            return image;
        });
        process.exit;
        let abilities = {};
        abilities[albumId] = {
            Access: {
                see: true,
                image_upload: true
            }
        };
        let token = jwt.sign({
            abilities: abilities,
            iss: process.env.SHARINPIX_SECRET_ID
        }, process.env.SHARINPIX_SECRET);
        images.forEach(function(image) {
            unirest.post('https://' + process.env.ENDPOINT_DOMAIN + '/api/v1/imports').headers({
                'Content-Type': 'application/json',
                'Authorization': 'Token token="' + token + '"'
            }).send({
                album_id: albumId,
                filename: image.name,
                url: image.url,
                import_type: 'url',
                metadatas: {
                    externalId: image.externalId,
                    filepath: outputFilePath
                }
            }).end(function (response) {
                let csvJson = jsonfile.readFileSync(outputFilePath);
                csvJson[image.externalId].sentForUpload = true;
                jsonfile.writeFileSync(outputFilePath, csvJson);
                console.log('Image `' + image.name + '` sent for import.');
            });
        })
    })
    res.redirect(`/status/${csvJsonId}`);
});

app.get('/status/:csvJsonId', function(req, res) {
    let csvJsonId = req.params.csvJsonId;
    let csvJson = jsonfile.readFileSync(`${__dirname}/csv-jsons/${csvJsonId}.csv`);
    let csvJsonPairs = _.pairs(csvJson);
    let response = {};
    for (let csvJsonPair of csvJsonPairs) {
        response[csvJsonPair[1].name] = {
            sentForUpload: csvJsonPair[1].sentForUpload ? true : false,
            webhookCompleted: csvJsonPair[1].webhookCompleted ? true : false
        }
    }
    res.send(response);
});

app.listen(process.env.PORT, function () {
    console.log(`Example app listening on port ${process.env.PORT}`);
});