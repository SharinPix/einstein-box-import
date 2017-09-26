const parseCsvImages = require('./parse-csv-images');
const _ = require('underscore');
const Sharinpix = require('sharinpix');
const async = require('async');

module.exports = function(albumId, bufferStream, outputFilePath, sharinpixInstance){
    this.sharinpixInstance = sharinpixInstance;
    parseCsvImages(bufferStream, outputFilePath, function(imagesHash) {
        let imagesBoxHash = imagesHash;
        let images = _.map(imagesHash, function(image, externalId) {
            image['externalId'] = externalId;
            image = (({ url, name, externalId }) => ({ url, name, externalId }))(image);
            return image;
        });
        var imagesBox = _.map(imagesBoxHash, function(image, externalId){
            externalId = externalId.toString();
            image = (({ otherAttributes }) => ({ externalId, otherAttributes }))(image);    
            return image;
        });
        var imagesBoxObject =  _.indexBy(imagesBox, 'externalId');
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
                    callback(null, { id: res.id, image_id: image.externalId });
                },
                (err)=>{
                    callback(body, null);

                });
            }
            asyncTasks.push(asyncFunc);
        });
        async.parallelLimit(asyncTasks, 5, function(err, results){
            if(results !== null && results.length > 0){
                createBox(results);
            }
            if(err !== null && err.size > 0){
                writeErrorLog(err);
            }
        });
        function createBox(results){
            _.each(results, function(imageImport){
                setInterval(function() {
                    sharinpixInstance.get(`/imports/${imageImport.id}`, {admin: true}).then(
                        (res)=>{
                            if(res != null){
                                let imgId = res['id'];
                                let extId = res['params']['metadatas']['externalId'];
                                if(imagesBoxObject[extId] != null){
                                    var imagesBoxArray =  _.values(imagesBoxObject);
                                    _.each(imagesBoxArray, function(element){
                                        element = (({otherAttributes}) => ({otherAttributes}))(element);
                                        let imagesBoxFlat = _.values(_.values(element));
                                        let imagesBoxSplice = imagesBoxFlat.splice(2, imagesBoxFlat.length);
                                        _.each(element, function(item){
                                            sharinpixInstance.post(`/images/${imgId}/einstein_box#create`, item, {admin: true}).then(
                                                (res) => {
                                                },
                                                (err) =>{
                                                }
                                            );
                                        });
                                    });
                                }
                                if (res.id != null){
                                    clearInterval(this);
                                }                            
                            }
                        },
                        (err)=>{
                        }
                    )                    
                }, 5000);
            });
        }
        function writeErrorLog(err){
        }
    });
}
