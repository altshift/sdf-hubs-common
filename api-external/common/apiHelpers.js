"use strict";

/**
 * @param {string} _url an url to guess the collection from
 * @returns {string} the collection name
 */
function guessCollectionFromUrl(_url) {
    const urlParts = _url.split("/");
    let collectionName = urlParts.length > 1 ? urlParts[1] : null;

    if (collectionName) {
        collectionName = collectionName[0].toUpperCase() + collectionName.substring(1);
        if (collectionName[collectionName.length - 1] === "s") {
            collectionName = collectionName.substr(0, collectionName.length - 1);
        }
    }

    return collectionName;
}

/**
 * Parse given object and replace wterline association values by our api association values
 *
 * @param {object} _object javascript object to parse in order to find api association
 * @returns {object} the object in argument
 */
function resolveApiAssociation(_object) {
    return Object.keys(_object).forEach(_key => {
        const regex = /^\$api_association_(.*)$/;
        const matches = _key.match(regex);
        const associatedKey = matches && matches.length > 1 && matches[1];

        if (associatedKey) {
            _object[associatedKey] = _object[_key];
            delete _object[_key];
        }
    });
}

/**
 * Populate the given model for given association with the
 * value from _associationKey in the association document
 *
 * @param {object} _query the Waterline query object
 * @param {string} _associationField the association field name in our document
 * @param {string} _associationKey the association key we want to use
 * @returns {object} Waterline query which is a promise too
 */
function populateModel(_query, _associationField, _associationKey) {
    const query = {};

    if (_associationKey) {
        query.select = [_associationKey];
    }

    return _query.populate(_associationField, query).then(model => {
        if (model && model[_associationField]) {
            model[`$api_association_${_associationField}`] = model[_associationField].map(associationDoc => {
                return associationDoc[_associationKey];
            });
        }

        return model;
    });
}

/**
 * Populate the given model for all waterline associations with api association values
 *
 * @param {object} _queryPromise promise returning a model
 * @param {object} _collection waterline collection used for query
 * @returns {object} the promise returning the model populated
 */
function populate(_queryPromise, _collection) {
    const associationsKeys = _collection.getAssociationPopulateKey() || {};
    const associations = _collection.associations;
    const allPromise = [];

    associations.forEach(({alias}) => {
        allPromise.push(populateModel(_queryPromise, alias, associationsKeys[alias]));
    });

    return Promise.all(allPromise).then(([model]) => model);
}

module.exports = {
    guessCollectionFromUrl,
    populate,
    resolveApiAssociation
};
