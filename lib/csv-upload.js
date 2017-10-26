const parseCsvImages = require('./parse-csv-images');
const _ = require('lodash');
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
            image = (({ width, height, otherAttributes }) => ({ width, height, externalId, otherAttributes }))(image);    
            return image;
        });
        var imagesBoxObject =  _.keyBy(imagesBox, 'externalId');
        let abilities = {};
        abilities[albumId] = { Access: { see: true, image_upload: true, einstein_box: true }  };
        let claims = { abilities: abilities };
        parallelTasks = [];
        
        _.each(images, function(image){
            let body = { album_id: albumId, filename: image.name, 
                url: image.url, import_type: 'url',
                metadatas: { externalId: image.externalId, filepath: outputFilePath }
            };    

            parallelTasks.push(
                function(callback) {
                    sharinpixInstance.post('/imports', body, claims).then (
                    function(res) {
                        callback(null, { id: res.id, external_id: image.externalId });
                    },
                    function(err) {
                        callback(body, null);
                    });
                }
            );
        })
        
        parallelRequests(parallelTasks, 5, function(errors, results){
            if(results !== null && results.length > 0){
                checkImports(results);
            }
            if(errors !== null && errors.length > 0){
            }
        })

        let importTasks = [];
        function checkImports(importResults) {
            _.each(importResults, function(imp){
                importTasks.push(
                    function(callback){
                        async.retry(
                            {
                                errorFilter: function(err) {
                                    return err.image_id == null;
                                },
                                interval: 3000
                            }, 
                            function(done){
                                sharinpixInstance.get(`/imports/${imp.id}`, {admin: true}).then(
                                    function(impResult){
                                        if (impResult.image_id == null){
                                            done(impResult);
                                        }
                                        else {
                                            done(null, impResult);
                                        }
                                    },
                                    function(impError){
                                        done(null, {})
                                    }
                                )
                            }, 
                            function(err, result) {
                                callback(err, result);
                            }
                        );
                    }
                )
            })
            parallelRequests(importTasks, 5, function(errors, results){
                if(results !== null && results.length > 0){
                    createBox(results)
                }
                if(errors !== null && errors.length > 0){
                }
            })
        }

        let boxTasks = [];
        function createBox(importRes){
            _.each(importRes, function(imp){
                if (imp == undefined || imp == null || imp == {}){
                    console.log('there was an error on imp here');    
                }
                else {
                    let einsteinBoxes = refineStruct(imagesBoxObject[imp.params.metadatas.externalId]);                
                    _.each(einsteinBoxes, function(box){
                        box.image_id = imp.image_id;
                        boxTasks.push(
                            function(callback){
                                sharinpixInstance.post(`/images/${box.image_id}/einstein_box`, box, claims).then(
                                    function(res){
                                        callback(null, res);
                                    },
                                    function(err){
                                        callback(err, null);
                                    }
                                )
                            }
                        )
                    })
                }
            })
            console.log('box size: '+boxTasks.length)
            parallelRequests(boxTasks, 5, function(err, result){
                console.log('### completed == ' + result.length);
            })
        }

        function refineStruct(element){
            let imageWidth = element.width;
            let imageHeight = element.height;
            element2 = (({otherAttributes}) => ({otherAttributes}))(element);
            let imagesBoxFlat = _.values(_.values(element2));
            let einsteinBoxes = _.map(imagesBoxFlat, (item) => {
                item = _.values(item);
                return item;
            });
            let x = _.flatten(einsteinBoxes);
            let onlyboxes = _.filter(x, function(box){
                return box != '';
            })
            let boxes = _.map(onlyboxes, function(box){
                let percentageWidth = (box.width / imageWidth) * 100;
                let percentageHeight = (box.height / imageHeight) * 100;
                let percentageX = (box.x / imageWidth) * 100;
                let percentageY = (box.y / imageHeight) * 100;
                return {label: box.label, width: percentageWidth, height: percentageHeight, left: percentageX, top: percentageY };
            })
            return boxes;
        }

        function parallelRequests(tasks, limit, callback){
            async.parallelLimit(tasks, limit, function(err, results){
                callback(err, results);
            });
        }
    });
}
