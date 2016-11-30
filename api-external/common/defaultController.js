"use strict";

// local dependencies
const {
    send400,
    send403,
    handleErrorAsync
} = require("./clientError/errorDefinitions");

const {test404Async} = require("./clientError/errorHelper");

const {populate, getParamsObject, getPaginationLinks} = require("./apiHelpers");
const {translateModelsAsync} = require("./translateModels");
const {saveModelAndAssociations} = require("./associationHelper");

/**
 * @param {object} [_options] Options of the generated controller
 * @param {string} [_options.byIdKey] Key to use for the getById route, "id" by default
 * @param {string} [_options.byIdModelKey] Key to use for the getById query, byIdKey by default
 * @param {string} [_options.collectionName] the name of the collection
 * @param {function} [_options.beforeController] Called with controller info before
 * doing the controller logic
 * @param {function} [_options.finalizeJsonModel] Called with jsonified model data before
 * being sent to the client
 * @param {function} [_options.onError] Called when an error occurs in controller
 * @param {object} [_options.s3Config] amazon s3 configs
 * @param {object} _options.s3Config.translationBucket amazon s3 bucket where to find translation files
 * @param {object} _options.s3Config.client connected amazon s3 client
 * @returns {object} A rest controller with default behaviour
 */
function generateDefaultController(_options = {}) {
    /**
     * @param {object} _controllerInfo Info about the current controller
     * @returns {promise} a promise
     */
    function beforeController(_controllerInfo) {
        const beforeExists = typeof _options.beforeController === "function";

        return beforeExists ? _options.beforeController(_controllerInfo) : Promise.resolve();
    }

    /**
     * @param {object} _controllerInfo Info about the current controller
     * @returns {function} a promise error callback
     */
    function onErrorAsync(_controllerInfo) {
        return (_error) => {
            const onErrorExists = typeof _options.onError === "function";

            return onErrorExists ? _options.onError(_error, _controllerInfo) : Promise.reject(_error);
        };
    }

    /**
     * @param {object} _model the jsonified model ready to be sent over the wire
     * @returns {promise<object>} promise returning the transformed object to send
     */
    function finalize(_model) {
        const json = _model.toJSON();

        return new Promise((_resolve, _reject) => {
            if (typeof _options.finalizeJsonModel === "function") {
                _options.finalizeJsonModel(json).then(_resolve, _reject);
            } else {
                _resolve(json);
            }
        });
    }

    /**
     * @param {object[]} _models the models to finalize
     * @returns {promise<object>} promise returning the transformed object to send
     */
    function finalizeAll(_models) {
        return new Promise((_resolve, _reject) => {
            const allModels = [];
            const allPromises = _models.map((_model, _index) => {
                return finalize(_model).then((_json) => {
                    allModels[_index] = _json;
                });
            });

            Promise.all(allPromises)
                .then(() => {
                    _resolve(allModels);
                })
                .catch(_reject);
        });
    }

    /**
     * Send to the client the requested document by id,
     * collection is guessed from url
     * Send a 404 if document is not found
     *
     * @param {object} _request connect request
     * @param {object} _response connect response
     * @param {function} _next connect next callback
     * @returns {void}
     */
    function getByIdRoute(_request, _response, _next) {
        const idKey = _options.byIdKey || "id";
        const idModelKey = _options.byIdModelKey || idKey;
        const idValue = _request.swagger.params[idKey].value;
        const query = {where: {}};
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName] || _request.asData.collection;
        const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;
        const s3Config = _options.s3Config || {};

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }
        query.where[idModelKey] = idValue;

        if (collectionHasSoftDelete) {
            query.where._isSuppressed = false;
        }

        const controllerInfo = {
            controller: "getByIdRoute",
            data: query,
            id: idValue
        };

        beforeController(controllerInfo)
            .then(() => populate(collection.findOne(controllerInfo.data), collection))
            .then(translateModelsAsync(
                    collection,
                    s3Config.client,
                    s3Config.translationBucket
                ))
            .then(test404Async(`GET: Unable to find item with ${idKey} '${idValue}' `
                        + `from '${collectionName}'`))
            .then(finalize)
            .then((_result) => _response.send(_result))
            .catch(onErrorAsync(controllerInfo))
            .catch(handleErrorAsync(_next));
    }

    /**
     * @param {object} _request connect request
     * @param {object} _response connect response
     * @param {function} _next connect next callback
     * @returns {void}
     */
    function getRoute(_request, _response, _next) {
        const params = getParamsObject(_request.swagger);
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];
        const collectionHasSoftDelete = collection && collection.attributes._isSuppressed !== undefined;
        const s3Config = _options.s3Config || {};

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }

        if (collectionHasSoftDelete) {
            params.where._isSuppressed = false;
        }

        const controllerInfo = {
            controller: "getRoute",
            data: params
        };
        let queryPromise, queryCountPromise;

        beforeController(controllerInfo)
            .then(() => {
                const {data} = controllerInfo;

                queryPromise = collection.find(data);
                queryCountPromise = collection.count(data.where);

                return populate(queryPromise, collection);
            })
            .then(translateModelsAsync(
                collection,
                s3Config.client,
                s3Config.translationBucket
            ))
            .then(finalizeAll)
            .then((_result) => {
                return queryCountPromise.then((_countResult) => {
                    const url = _request.getFullUrl();

                    _response
                        .set({
                            Link: getPaginationLinks(url, params.skip, params.limit, _countResult),
                            "X-Current-Page": Math.ceil((params.skip || 0) / params.limit),
                            "X-Total-Item-Count": _countResult,
                            "X-Total-Page-Count": Math.ceil(_countResult / params.limit)
                        });

                    return _result;
                });
            })
            .then((_result) => _response.send(_result))
            .catch(onErrorAsync(controllerInfo))
            .catch(handleErrorAsync(_next));
    }

    /**
     * @param {object} _request connect request
     * @param {object} _response connect response
     * @param {function} _next connect next callback
     * @returns {void}
     */
    function postRoute(_request, _response, _next) {
        const paramKeys = Object.keys(_request.swagger.params);
        const postedItemName = paramKeys.length > 0 ? paramKeys[0] : null;
        const postedItem = postedItemName ? _request.swagger.params[postedItemName] : null;
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }

        if (postedItem === null) {
            send400(
                "Post must contain data for creating item",
                [{key: postedItemName, message: "", type: "required"}]
            );
        }

        const controllerInfo = {
            controller: "postRoute",
            data: postedItem.value
        };

        beforeController(controllerInfo)
            .then(() => saveModelAndAssociations(collection, controllerInfo.data))
            .then(finalize)
            .then((_result) => _response.send(_result))
            .catch(onErrorAsync(controllerInfo))
            .catch(handleErrorAsync(_next));
    }

    /**
     * @param {object} _request connect request
     * @param {object} _response connect response
     * @param {function} _next connect next callback
     * @returns {void}
     */
    function putRoute(_request, _response, _next) {
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];
        const puttedItemName = collectionName.toLowerCase();
        const puttedItem = puttedItemName ? _request.swagger.params[puttedItemName] : null;
        const puttedId = _request.swagger.params.id === undefined ? null : _request.swagger.params.id.value;

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" `
                + `from Url "${_request.url}" in default getByIdRoute, `
                + "maybe the route should be overloaded?");

            return;
        } else if (puttedItem === null) {
            send400(
                "Put must contain data for updating item",
                [{key: puttedItemName, message: "", type: "required"}]
            );
        } else if (puttedId === null) {
            send400(
                "Put must provides an id of the item to update",
                [{key: "id", message: "", type: "required"}]
            );
        }

        const controllerInfo = {
            controller: "putRoute",
            data: puttedItem.value,
            id: puttedId
        };

        beforeController(controllerInfo)
            .then(() => saveModelAndAssociations(collection, controllerInfo.data, puttedId))
            .then(finalize)
            .then((_result) => _response.send(_result))
            .catch(onErrorAsync(controllerInfo))
            .catch(handleErrorAsync(_next));
    }

    /**
     * @param {object} _request connect request
     * @param {object} _response connect response
     * @param {function} _next connect next callback
     * @returns {void}
     */
    function deleteRoute(_request, _response, _next) {
        const id = _request.swagger.params.id.value;
        const query = {where: {id}};
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];
        const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

        let deletePromise;

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }
        if (_options.allowRealDelete) {
            deletePromise = collection.destroy({id});
        } else if (collectionHasSoftDelete) {
            deletePromise = collection.update(query, {_isSuppressed: true});
        } else {
            send403(_next, `You are not allowed to delete an object from '${collectionName}'`);

            return;
        }

        const controllerInfo = {
            controller: "deleteRoute",
            data: query
        };

        beforeController(controllerInfo)
            .then(() => deletePromise)
            .then(test404Async(`DELETE: Unable to find item with id '${id}' `
                                        + `from '${collectionName}'`))
            .then(() => _response.status(204).send()) // eslint-disable-line no-magic-numbers
            .catch(onErrorAsync(controllerInfo))
            .catch(handleErrorAsync(_next));
    }

    return {
        deleteRoute,
        getByIdRoute,
        getRoute,
        postRoute,
        putRoute
    };
}

module.exports = generateDefaultController;
