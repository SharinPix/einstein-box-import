const parseCsvImages = require('./parse-csv-images');
const _ = require('underscore');
const Sharinpix = require('sharinpix');
const async = require('async');

module.exports = function(albumId, bufferStream, outputFilePath, sharinpixInstance){
    this.sharinpixInstance = sharinpixInstance;
    parseCsvImages(bufferStream, outputFilePath, function(imagesHash) {
        let images = _.map(imagesHash, function(image, externalId) {
            image['externalId'] = externalId;
            image = (({ url, name, externalId }) => ({url, name, externalId }))(image);
            return image;
        });

        let abilities = {};
        abilities[albumId] = {
            Access: {
                see: true,
                image_upload: true
            }
        };
        let claims = {
            abilities: abilities
        };
        asyncTasks = [];
        _.each(images,function(image) {
            let body = {
                album_id: albumId,
                filename: image.name,
                url: image.url,
                import_type: 'url',
                metadatas: {
                    externalId: image.externalId,
                    filepath: outputFilePath
                }
            };
            asyncFunc = function(callback){
                sharinpixInstance.post('/imports', body, claims).then (
                (res)=> {
                    callback(null, true);
                },
                (err)=>{
                    callback(true, null);
                });
            }
            asyncTasks.push(asyncFunc);
        });

        async.parallelLimit(asyncTasks, 5, function(err, results){
            console.log('error', err);
            console.log('results', results);
        });
    });
}
